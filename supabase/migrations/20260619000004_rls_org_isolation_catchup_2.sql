-- ============================================================
-- RLS catch-up #2 — re-aplicar isolamento a tabelas novas com org_id
-- ============================================================
-- A feature de faturação (merge 2026-06-19) trouxe tabelas com org_id que
-- ficaram sem a policy RESTRICTIVE padrão `rls_org_isolation` — confirmado
-- pela auditoria rls_org_audit.sql:
--   contrato_historico (tinha só a PERMISSIVE org-scoped `ch_select`).
--
-- `contrato_historico` não estava a vazar (ch_select já filtra por org), mas
-- sem a barreira RESTRICTIVE uma futura policy permissiva reabriria o buraco.
-- Esta migration re-corre o MESMO loop genérico de 20260617000002
-- (idempotente: DROP POLICY IF EXISTS + CREATE). Aditivo e fail-closed.
--
-- Verificar depois: correr rls_org_audit.sql → Parte 1 com 0 linhas.
-- Ver [[project-rls-org-isolation]].
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
