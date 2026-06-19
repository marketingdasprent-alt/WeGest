-- ============================================================
-- Fechar 2 fugas multi-tenant confirmadas (auditoria 2026-06-19)
-- ============================================================
-- Tabelas criadas fora das migrations (UI do Supabase) que escaparam ao
-- isolamento por org — confirmado por pg_policies em produção:
--
--   lead_status_history          → policy "Todos podem visualizar" USING (true)
--   motorista_custos_adicionais  → policy USING (auth.role() = 'authenticated')
--
-- Ambas deixavam QUALQUER org ver o histórico de leads / custos de motoristas
-- de TODAS as orgs. Fix: adicionar org_id (backfill a partir do pai) +
-- policy RESTRICTIVE rls_org_isolation (faz AND com a permissive existente →
-- acesso fica org-scoped). Aditivo e idempotente. Ver [[project-rls-org-isolation]].
-- ============================================================

DO $$
DECLARE
  v_org_default uuid;
BEGIN
  SELECT id INTO v_org_default
    FROM public.organizacoes ORDER BY created_at ASC LIMIT 1;

  -- ---- lead_status_history (pai: leads_dasprent.lead_id) ----
  ALTER TABLE public.lead_status_history
    ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizacoes(id);

  UPDATE public.lead_status_history h
     SET org_id = l.org_id
    FROM public.leads_dasprent l
   WHERE h.lead_id = l.id
     AND h.org_id IS NULL;

  -- Órfãos (lead apagado) → org default, para o NOT NULL não falhar.
  UPDATE public.lead_status_history SET org_id = v_org_default WHERE org_id IS NULL;

  ALTER TABLE public.lead_status_history ALTER COLUMN org_id SET DEFAULT public.get_current_org_id();
  ALTER TABLE public.lead_status_history ALTER COLUMN org_id SET NOT NULL;

  -- ---- motorista_custos_adicionais (pai: motoristas.motorista_id) ----
  ALTER TABLE public.motorista_custos_adicionais
    ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizacoes(id);

  UPDATE public.motorista_custos_adicionais mc
     SET org_id = m.org_id
    FROM public.motoristas m
   WHERE mc.motorista_id = m.id
     AND mc.org_id IS NULL;

  UPDATE public.motorista_custos_adicionais SET org_id = v_org_default WHERE org_id IS NULL;

  ALTER TABLE public.motorista_custos_adicionais ALTER COLUMN org_id SET DEFAULT public.get_current_org_id();
  ALTER TABLE public.motorista_custos_adicionais ALTER COLUMN org_id SET NOT NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_status_history_org ON public.lead_status_history(org_id);
CREATE INDEX IF NOT EXISTS idx_motorista_custos_adicionais_org ON public.motorista_custos_adicionais(org_id);

-- ---- Policies RESTRICTIVE de isolamento (AND com as permissive existentes) ----
ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_org_isolation ON public.lead_status_history;
CREATE POLICY rls_org_isolation ON public.lead_status_history
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id());

ALTER TABLE public.motorista_custos_adicionais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_org_isolation ON public.motorista_custos_adicionais;
CREATE POLICY rls_org_isolation ON public.motorista_custos_adicionais
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id());
