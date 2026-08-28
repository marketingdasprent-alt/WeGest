-- ============================================================
-- Check-in por token: não exigir permissão de renting_contratos
-- ============================================================
-- Os RPCs do token (consumir/realizar) são SECURITY DEFINER e validam
-- org + validade, mas a página RealizarEntregaPage fazia leituras/escritas
-- DIRETAS a contratos_renting (sujeitas à RLS de renting). Quem faz o check
-- no terreno via token — tipicamente sem 'renting_contratos' — levava com
-- "Viatura do contrato não encontrada" e o km/combustível não gravava.
--
-- Passa-se o que é do CONTRATO para funções SECURITY DEFINER autorizadas pelo
-- próprio token, sem dar acesso a outros contratos:
--   1) contexto_folha_por_token(): resolve viatura + condutor + empresa
--      emissora + cliente + km/combustível de saída no servidor.
--   2) realizar_token_realizacao(): passa a gravar km/combustível no contrato.
-- ============================================================

-- 1) Contexto da folha resolvido a partir do token (replica resolverCondutor).
CREATE OR REPLACE FUNCTION public.contexto_folha_por_token(p_token uuid)
RETURNS TABLE(
  viatura_id                   uuid,
  emissor_id                   uuid,
  empresa_nome                 text,
  empresa_nif                  text,
  empresa_sede                 text,
  empresa_licenca_tvde         text,
  empresa_licenca_validade     text,
  empresa_representante        text,
  empresa_cargo_representante  text,
  condutor_nome                text,
  condutor_email               text,
  cliente_nome                 text,
  km_saida                     integer,
  combustivel_saida            text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token     realizacao_tokens%ROWTYPE;
  v_contrato  contratos_renting%ROWTYPE;
  v_cond      RECORD;
  r_nome      text := '';
  r_email     text := '';
  r_cliente   text := '';
  r_emp_nome  text := '';
  r_emp_nif   text := '';
  r_emp_sede  text := '';
  r_emp_tvde  text := '';
  r_emp_val   text := '';
  r_emp_rep   text := '';
  r_emp_cargo text := '';
BEGIN
  SELECT * INTO v_token FROM public.realizacao_tokens WHERE id = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido.';
  END IF;
  IF v_token.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Token de outra organização.';
  END IF;

  SELECT * INTO v_contrato FROM public.contratos_renting WHERE id = v_token.contrato_id;

  -- Empresa emissora → {{empresa_*}}.
  IF v_contrato.emissor_id IS NOT NULL THEN
    SELECT
      COALESCE(NULLIF(c.nome_comercial, ''), c.nome, ''),
      COALESCE(c.nif, ''),
      COALESCE(c.sede, ''),
      COALESCE(c.licenca_tvde, ''),
      COALESCE(c.licenca_validade::text, ''),
      COALESCE(c.representante, ''),
      COALESCE(c.cargo_representante, '')
    INTO r_emp_nome, r_emp_nif, r_emp_sede, r_emp_tvde, r_emp_val, r_emp_rep, r_emp_cargo
    FROM public.clientes c
    WHERE c.id = v_contrato.emissor_id;
  END IF;

  -- Condutor principal (contrato_condutores): cliente XOR motorista.
  SELECT cc.cliente_id, cc.motorista_id
    INTO v_cond
    FROM public.contrato_condutores cc
   WHERE cc.contrato_id = v_token.contrato_id
   ORDER BY cc.is_principal DESC NULLS LAST
   LIMIT 1;

  IF v_cond.cliente_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(c.nome, ''), c.nome_comercial, ''), COALESCE(c.email, '')
      INTO r_nome, r_email
      FROM public.clientes c WHERE c.id = v_cond.cliente_id;
  ELSIF v_cond.motorista_id IS NOT NULL THEN
    SELECT COALESCE(m.nome, ''), COALESCE(m.email, '')
      INTO r_nome, r_email
      FROM public.motoristas_ativos m WHERE m.id = v_cond.motorista_id;
  ELSIF v_contrato.viatura_id IS NOT NULL THEN
    -- Fallback: motorista ATIVO associado à viatura (só se o contrato não
    -- define condutor). Nunca um motorista histórico (status <> 'ativo').
    SELECT COALESCE(m.nome, ''), COALESCE(m.email, '')
      INTO r_nome, r_email
      FROM public.motorista_viaturas mv
      JOIN public.motoristas_ativos m ON m.id = mv.motorista_id
     WHERE mv.viatura_id = v_contrato.viatura_id
       AND mv.status = 'ativo'
     ORDER BY mv.data_inicio DESC
     LIMIT 1;
  END IF;

  -- Cliente/locatário → {{cliente_nome}}.
  IF v_contrato.cliente_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(c.nome_comercial, ''), c.nome, '')
      INTO r_cliente
      FROM public.clientes c WHERE c.id = v_contrato.cliente_id;
  END IF;

  RETURN QUERY SELECT
    v_contrato.viatura_id,
    v_contrato.emissor_id,
    COALESCE(r_emp_nome, ''),
    COALESCE(r_emp_nif, ''),
    COALESCE(r_emp_sede, ''),
    COALESCE(r_emp_tvde, ''),
    COALESCE(r_emp_val, ''),
    COALESCE(r_emp_rep, ''),
    COALESCE(r_emp_cargo, ''),
    COALESCE(r_nome, ''),
    COALESCE(r_email, ''),
    COALESCE(r_cliente, ''),
    v_contrato.km_saida,
    v_contrato.combustivel_saida;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.contexto_folha_por_token(uuid)
  TO anon, authenticated, service_role;

-- 2) Realizar: além de mudar estado/marcar evento+token, grava km/combustível
--    no contrato (saída p/ entrega e troca; entrada p/ recolha). Como é
--    SECURITY DEFINER, não exige permissão de renting a quem confirma o token.
--    Substitui a assinatura (uuid) por (uuid, numeric, text) com defaults — o
--    frontend antigo, que chama só {p_token}, continua a resolver (km NULL).
DROP FUNCTION IF EXISTS public.realizar_token_realizacao(uuid);

CREATE OR REPLACE FUNCTION public.realizar_token_realizacao(
  p_token       uuid,
  p_km          numeric DEFAULT NULL,
  p_combustivel text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token       realizacao_tokens%ROWTYPE;
  v_evento      calendario_eventos%ROWTYPE;
  v_novo_estado text;
  v_actor       uuid;
  v_km          integer := CASE WHEN p_km IS NULL THEN NULL ELSE round(p_km)::integer END;
BEGIN
  SELECT * INTO v_token
    FROM public.realizacao_tokens
   WHERE id = p_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido.';
  END IF;
  IF v_token.expires_at < now() THEN
    RAISE EXCEPTION 'Token expirado.';
  END IF;
  IF v_token.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Token já foi usado.';
  END IF;
  IF v_token.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Token de outra organização.';
  END IF;

  SELECT * INTO v_evento FROM public.calendario_eventos WHERE id = v_token.evento_id;
  IF v_evento.realizado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Evento já realizado.';
  END IF;

  v_actor := COALESCE(auth.uid(), v_token.created_by);

  IF v_token.tipo = 'troca' THEN
    -- Troca conta como entrega da viatura nova → km/combustível de saída.
    -- Não muda estado_operacional (marca o evento diretamente).
    UPDATE public.contratos_renting
       SET km_saida          = COALESCE(v_km, km_saida),
           combustivel_saida = COALESCE(p_combustivel, combustivel_saida),
           updated_by        = v_actor
     WHERE id = v_token.contrato_id;

    UPDATE public.calendario_eventos
       SET realizado_em     = now(),
           realizado_por_id = v_actor
     WHERE id = v_token.evento_id;

    UPDATE public.realizacao_tokens
       SET used_at = now()
     WHERE id = v_token.id;

    RETURN;
  END IF;

  v_novo_estado := CASE v_token.tipo
    WHEN 'entrega' THEN 'em_curso'
    WHEN 'recolha' THEN 'devolvido'
  END;
  IF v_novo_estado IS NULL THEN
    RAISE EXCEPTION 'Tipo de token inesperado: %.', v_token.tipo;
  END IF;

  -- Muda o estado do contrato (dispara o trigger que marca o evento realizado)
  -- e grava km/combustível: saída na entrega, entrada na recolha.
  UPDATE public.contratos_renting
     SET estado_operacional  = v_novo_estado::contrato_estado_operacional_enum,
         km_saida            = CASE WHEN v_token.tipo = 'entrega'
                                    THEN COALESCE(v_km, km_saida) ELSE km_saida END,
         combustivel_saida   = CASE WHEN v_token.tipo = 'entrega'
                                    THEN COALESCE(p_combustivel, combustivel_saida) ELSE combustivel_saida END,
         km_entrada          = CASE WHEN v_token.tipo = 'recolha'
                                    THEN COALESCE(v_km, km_entrada) ELSE km_entrada END,
         combustivel_entrada = CASE WHEN v_token.tipo = 'recolha'
                                    THEN COALESCE(p_combustivel, combustivel_entrada) ELSE combustivel_entrada END,
         updated_by          = v_actor
   WHERE id = v_token.contrato_id;

  UPDATE public.realizacao_tokens
     SET used_at = now()
   WHERE id = v_token.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.realizar_token_realizacao(uuid, numeric, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
