-- ============================================================
-- Id do template da Folha de Danos no contexto por token
-- ============================================================
-- RealizarEntregaPage (fluxo público de check-in/check-out/troca por
-- token) resolvia o template 'anexo_danos' com uma query directa a
-- document_templates a partir do browser. Essa tabela tem RLS
-- "mt_templates_select" (TO authenticated, org-scoped) — quem faz o
-- check no terreno normalmente não tem sessão/permissão de renting,
-- por isso a query voltava vazia e a UI mostrava "não existe Folha de
-- Danos activa" mesmo havendo uma.
--
-- Fix: resolver o template_id dentro da própria RPC
-- contexto_folha_por_token(), que já é SECURITY DEFINER e bypassa RLS
-- por design (mesmo padrão usado para papel_timbrado/logo_url em
-- 20260715130000). Prioriza o template activo da empresa emissora do
-- contrato; sem emissor (ou sem template dessa empresa), cai para
-- qualquer 'anexo_danos' activo da org do token.
--
-- Postgres não deixa alterar as colunas de retorno com CREATE OR
-- REPLACE — é preciso DROP + CREATE (mesmo padrão já usado nesta
-- função).
-- ============================================================

DROP FUNCTION IF EXISTS public.contexto_folha_por_token(uuid);

CREATE FUNCTION public.contexto_folha_por_token(p_token uuid)
RETURNS TABLE(
  viatura_id                   uuid,
  emissor_id                   uuid,
  anexo_danos_template_id      uuid,
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
  r_tmpl_id   uuid := NULL;
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

    SELECT dt.id INTO r_tmpl_id
      FROM public.document_templates dt
     WHERE dt.tipo = 'anexo_danos'
       AND dt.ativo = true
       AND dt.cliente_empresa_id = v_contrato.emissor_id
     ORDER BY dt.versao DESC
     LIMIT 1;
  END IF;

  -- Sem emissor definido, ou sem template dessa empresa: cai para
  -- qualquer 'anexo_danos' activo da mesma org (tolerante, nunca bloqueia
  -- o check-in/out por falta de emissor no contrato).
  IF r_tmpl_id IS NULL THEN
    SELECT dt.id INTO r_tmpl_id
      FROM public.document_templates dt
     WHERE dt.tipo = 'anexo_danos'
       AND dt.ativo = true
       AND dt.org_id = v_token.org_id
     ORDER BY dt.versao DESC
     LIMIT 1;
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
    r_tmpl_id,
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
