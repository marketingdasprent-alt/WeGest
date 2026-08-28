-- ============================================================
-- RLS catch-up — re-aplicar isolamento multi-tenant a tabelas novas
-- ============================================================
-- A migration 20260520000006 aplicou a policy RESTRICTIVE
-- `rls_org_isolation` num loop ÚNICO sobre as tabelas com org_id que
-- existiam nessa data. Tabelas com org_id criadas depois (aplicadas à
-- mão) ficaram SEM a barreira de isolamento — confirmado pela auditoria
-- supabase/tests/rls_org_audit.sql:
--   calendario_eventos_apagados, cartoes_frota, dispositivos_obe,
--   invoices, notas_credito, notificacoes
--
-- Esta migration re-corre o MESMO loop genérico (idempotente:
-- DROP POLICY IF EXISTS + CREATE). Cobre as 6 tabelas em falta e
-- qualquer outra com org_id que ainda não tenha a policy. Aditivo e
-- fail-closed (no pior caso o utilizador vê menos, nunca mais).
--
-- Verificar depois de aplicar: correr rls_org_audit.sql → 0 linhas.
-- Ver [[project-rls-org-isolation]] e migration 20260520000006.
-- ============================================================
DO $$
DECLARE
  t text;
  excluidas text[] := ARRAY[
    'user_org_ativa',
    'user_organizacoes',
    'convites',
    'profiles'
  ];
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema
     AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'org_id'
      AND tb.table_type = 'BASE TABLE'
      AND c.table_name <> ALL (excluidas)
    ORDER BY c.table_name
  LOOP
    -- Garante RLS ativa (tabelas novas podem tê-la esquecido)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_org_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (org_id = public.get_current_org_id()) '
      || 'WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id())',
      'rls_org_isolation', t
    );
    RAISE NOTICE 'isolamento org garantido: %', t;
  END LOOP;
END $$;
