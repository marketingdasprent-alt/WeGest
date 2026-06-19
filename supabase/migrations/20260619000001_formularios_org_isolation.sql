-- ============================================================
-- Isolamento multi-tenant: formularios + formulario_campanhas
-- ============================================================
-- BUG: a policy de SELECT em `formularios` usa `ativo = true OR is_admin
-- OR has_permission(...)`. O ramo `ativo = true` (necessário para a página
-- pública /formulario/:id, role anon) deixa QUALQUER utilizador autenticado
-- de QUALQUER org ver os formulários ativos de todas as outras orgs — os
-- formulários "passam" entre organizações na listagem do admin.
--
-- Causa raiz: `formularios` e `formulario_campanhas` nunca tiveram `org_id`,
-- por isso o loop genérico de isolamento (20260520000006 / catch-up
-- 20260617000002) nunca lhes aplicou a barreira RESTRICTIVE.
--
-- Fix: adicionar org_id (+ default get_current_org_id() + NOT NULL) e a
-- policy RESTRICTIVE `rls_org_isolation` TO authenticated. RESTRICTIVE faz
-- AND com a permissive existente → o admin passa a ver só os formulários da
-- SUA org. Como a policy é TO authenticated, NÃO afeta o role `anon`: a
-- página pública continua a ler formulários ativos por id.
--
-- Idempotente. Ver [[project-rls-org-isolation]].
-- ============================================================

DO $$
DECLARE
  v_org_default uuid;
BEGIN
  -- Org de backfill: a mais antiga (a original). Todos os formulários
  -- existentes foram criados por essa org.
  SELECT id INTO v_org_default
    FROM public.organizacoes
   ORDER BY created_at ASC
   LIMIT 1;

  -- ---- formularios ----
  ALTER TABLE public.formularios
    ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizacoes(id);

  UPDATE public.formularios SET org_id = v_org_default WHERE org_id IS NULL;

  ALTER TABLE public.formularios ALTER COLUMN org_id SET DEFAULT public.get_current_org_id();
  ALTER TABLE public.formularios ALTER COLUMN org_id SET NOT NULL;

  -- ---- formulario_campanhas (filho de formularios) ----
  ALTER TABLE public.formulario_campanhas
    ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizacoes(id);

  UPDATE public.formulario_campanhas fc
     SET org_id = f.org_id
    FROM public.formularios f
   WHERE fc.formulario_id = f.id
     AND fc.org_id IS NULL;

  -- Campanhas órfãs (sem formulário) → org default
  UPDATE public.formulario_campanhas SET org_id = v_org_default WHERE org_id IS NULL;

  ALTER TABLE public.formulario_campanhas ALTER COLUMN org_id SET DEFAULT public.get_current_org_id();
  ALTER TABLE public.formulario_campanhas ALTER COLUMN org_id SET NOT NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_formularios_org ON public.formularios(org_id);
CREATE INDEX IF NOT EXISTS idx_formulario_campanhas_org ON public.formulario_campanhas(org_id);

-- ---- Policy RESTRICTIVE de isolamento (espelha o padrão do catch-up) ----
ALTER TABLE public.formularios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_org_isolation ON public.formularios;
CREATE POLICY rls_org_isolation ON public.formularios
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id());

ALTER TABLE public.formulario_campanhas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_org_isolation ON public.formulario_campanhas;
CREATE POLICY rls_org_isolation ON public.formulario_campanhas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id());
