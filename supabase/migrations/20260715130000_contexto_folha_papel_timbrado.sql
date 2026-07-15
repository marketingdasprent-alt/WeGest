-- ============================================================
-- Papel timbrado por empresa no contexto da folha de danos (token)
-- ============================================================
-- O papel timbrado/logo passaram a viver na empresa emissora (clientes.
-- papel_timbrado / clientes.logo_url), não no template. A função
-- contexto_folha_por_token() (usada por RealizarEntregaPage no fluxo de
-- check-in/check-out por token) ainda não devolvia estas duas colunas, por
-- isso o timbre nunca aparecia nas folhas de danos geradas por esse fluxo.
--
-- Postgres não deixa alterar as colunas de retorno com CREATE OR REPLACE —
-- é preciso DROP + CREATE (mesmo padrão já usado nesta função em
-- 20260708130000_check_token_sem_permissao_renting.sql).
-- ============================================================

DROP FUNCTION IF EXISTS public.contexto_folha_por_token(uuid);

CREATE FUNCTION public.contexto_folha_por_token(p_token uuid)
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
  empresa_papel_timbrado       text,
  empresa_logo_url             text,
  condutor_nome                text,
  condutor_email                text,
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
  r_emp_papel text := NULL;
  r_emp_logo  text := NULL;
BEGIN
  SELECT * INTO v_token FROM public.realizacao_tokens WHERE id = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido.';
  END IF;
  IF v_token.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Token de outra organização.';
  END IF;

  SELECT * INTO v_contrato FROM public.contratos_renting WHERE id = v_token.contrato_id;

  -- Empresa emissora → {{empresa_*}} + fundo de página (papel timbrado/logo).
  IF v_contrato.emissor_id IS NOT NULL THEN
    SELECT
      COALESCE(NULLIF(c.nome_comercial, ''), c.nome, ''),
      COALESCE(c.nif, ''),
      COALESCE(c.sede, ''),
      COALESCE(c.licenca_tvde, ''),
      COALESCE(c.licenca_validade::text, ''),
      COALESCE(c.representante, ''),
      COALESCE(c.cargo_representante, ''),
      c.papel_timbrado,
      c.logo_url
    INTO r_emp_nome, r_emp_nif, r_emp_sede, r_emp_tvde, r_emp_val, r_emp_rep, r_emp_cargo,
         r_emp_papel, r_emp_logo
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
    r_emp_papel,
    r_emp_logo,
    COALESCE(r_nome, ''),
    COALESCE(r_email, ''),
    COALESCE(r_cliente, ''),
    v_contrato.km_saida,
    v_contrato.combustivel_saida;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.contexto_folha_por_token(uuid)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
