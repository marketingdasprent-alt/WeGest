-- Auditoria de segurança 2026-09-22: fecho das exposições na base de dados.
--
-- Cinco objectos deixavam dados de uma organização ao alcance de qualquer
-- utilizador autenticado de outra. Nenhum destes é necessário ao frontend
-- com o alcance que tinha; cada ponto abaixo diz o que muda e o que se mantém.

-- ─── 1. get_uber_platform_config: segredos só para a service role ──────────
--
-- Devolve client_secret e webhook_signing_key sem verificar organização. O
-- único chamador é a Edge Function uber-webhook, com service role. Um
-- utilizador com um integracao_id podia extrair os segredos e forjar webhooks.

REVOKE ALL ON FUNCTION public.get_uber_platform_config(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_uber_platform_config(uuid) TO service_role;

-- ─── 2. motoristas_saldo_pendente_lote: volta a respeitar a RLS ────────────
--
-- A versão de 2026-09-08 passou a SECURITY DEFINER sem motivo registado; a do
-- baseline era INVOKER e funcionava. Com DEFINER, um array de UUIDs de outra
-- organização devolvia os saldos. Com INVOKER, a RLS de motorista_financeiro
-- (rls_org_isolation + can_visew_financeiro / motorista vê os seus) filtra.

ALTER FUNCTION public.motoristas_saldo_pendente_lote(uuid[], date, date) SECURITY INVOKER;

-- ─── 3. v_dinheiro_sem_dono: aplica a RLS das tabelas de origem ────────────
--
-- Criada sem security_invoker, agregava ganhos e movimentos de todas as
-- organizações, e os privilégios por omissão davam SELECT a authenticated.
--
-- Condicional: a 2026-09-22 a migração 20260903110000 que cria a view nunca
-- tinha sido aplicada em produção (nem a função nem o trigger que a acompanham).
-- Quando essa migração for aplicada, correr este bloco a seguir.

DO $$
BEGIN
  IF to_regclass('public.v_dinheiro_sem_dono') IS NULL THEN
    RAISE NOTICE 'v_dinheiro_sem_dono não existe; passo 3 ignorado (aplicar 20260903110000 primeiro e repetir).';
    RETURN;
  END IF;

  ALTER VIEW public.v_dinheiro_sem_dono SET (security_invoker = true);
  REVOKE ALL ON TABLE public.v_dinheiro_sem_dono FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON TABLE public.v_dinheiro_sem_dono TO authenticated, service_role;
END;
$$;

-- ─── 4. get_gestores: só membros da organização activa ─────────────────────
--
-- Listava os nomes de todos os perfis com cargo, de todas as organizações.
-- Passa a seguir o modelo de get_gestores_tvde: membros da org activa do
-- chamador, e nada se o chamador não pertencer a essa org.

CREATE OR REPLACE FUNCTION public.get_gestores()
RETURNS TABLE(nome text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.nome
  FROM public.user_organizacoes uo
  JOIN public.profiles p ON p.id = uo.user_id
  WHERE uo.org_id = public.get_current_org_id()
    AND p.nome IS NOT NULL
    AND p.cargo IS NOT NULL
    AND p.cargo <> ''
    AND EXISTS (
      SELECT 1
      FROM public.user_organizacoes membro
      WHERE membro.user_id = auth.uid()
        AND membro.org_id  = public.get_current_org_id()
    )
  ORDER BY p.nome;
$$;

COMMENT ON FUNCTION public.get_gestores() IS
  'Nomes dos utilizadores com cargo na organização activa do chamador. Vazio se o chamador não for membro. Ver migração 20260922150000.';

-- ─── 5. get_viaturas_motorista_atual: recusa outra organização ─────────────
--
-- Aceitava qualquer p_org_id. O único chamador (DispositivosObeTab) não passa
-- argumento, por isso o default chega sempre; um valor diferente da org activa
-- é sempre uma tentativa e falha com erro explícito, não com lista vazia.

CREATE OR REPLACE FUNCTION public.get_viaturas_motorista_atual(
  p_org_id uuid DEFAULT public.get_current_org_id()
)
RETURNS TABLE(viatura_id uuid, motorista_id uuid, motorista_nome text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_org_id IS NULL OR p_org_id IS DISTINCT FROM public.get_current_org_id() THEN
    RAISE EXCEPTION 'Sem acesso a esta organização'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_organizacoes membro
    WHERE membro.user_id = auth.uid()
      AND membro.org_id  = p_org_id
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta organização'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    v.id AS viatura_id,
    COALESCE(cc.motorista_id, mv.motorista_id) AS motorista_id,
    m.nome AS motorista_nome
  FROM public.viaturas v
  LEFT JOIN LATERAL (
    SELECT cc2.motorista_id
    FROM public.contratos_renting cr
    JOIN public.contrato_condutores cc2 ON cc2.contrato_id = cr.id
    WHERE cr.viatura_id = v.id
      AND cr.deleted_at IS NULL
      AND cr.periodo @> now()
      AND cc2.motorista_id IS NOT NULL
      AND cc2.vigencia @> now()
    ORDER BY cc2.is_principal DESC, cc2.created_at DESC
    LIMIT 1
  ) cc ON true
  LEFT JOIN LATERAL (
    SELECT mv2.motorista_id
    FROM public.motorista_viaturas mv2
    WHERE mv2.viatura_id = v.id
      AND mv2.data_inicio <= CURRENT_DATE
      AND (mv2.data_fim IS NULL OR mv2.data_fim >= CURRENT_DATE)
    ORDER BY mv2.data_inicio DESC
    LIMIT 1
  ) mv ON true
  LEFT JOIN public.motoristas_ativos m ON m.id = COALESCE(cc.motorista_id, mv.motorista_id)
  WHERE v.org_id = p_org_id
    AND COALESCE(cc.motorista_id, mv.motorista_id) IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.get_viaturas_motorista_atual(uuid) IS
  'Motorista actual de cada viatura da organização activa. Um p_org_id diferente da org activa, ou um chamador que não seja membro, falha com insufficient_privilege. Ver migração 20260922150000.';

NOTIFY pgrst, 'reload schema';
