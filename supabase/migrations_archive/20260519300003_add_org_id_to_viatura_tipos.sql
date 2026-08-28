-- ============================================================
-- Adicionar org_id à tabela viatura_tipos para multi-tenancy
-- ============================================================
-- A tabela já existe mas não tinha org_id. Agora que vai ser
-- gerida por cada organização, precisa de multi-tenancy.
-- ============================================================

ALTER TABLE public.viatura_tipos
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Atualizar org_id dos registos existentes (para a primeira org disponível)
UPDATE public.viatura_tipos SET org_id = (SELECT id FROM public.organizacoes LIMIT 1) WHERE org_id IS NULL;

-- Tornar org_id NOT NULL depois de preencher
ALTER TABLE public.viatura_tipos ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_viatura_tipos_org ON public.viatura_tipos (org_id);

-- Substituir RLS antigo por multi-tenant
DROP POLICY IF EXISTS "viatura_tipos_select" ON public.viatura_tipos;
DROP POLICY IF EXISTS "viatura_tipos_all_admin" ON public.viatura_tipos;

CREATE POLICY "mt_viatura_tipos_select" ON public.viatura_tipos
  FOR SELECT TO authenticated USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_tipos_insert" ON public.viatura_tipos
  FOR INSERT TO authenticated WITH CHECK (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_tipos_update" ON public.viatura_tipos
  FOR UPDATE TO authenticated USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_tipos_delete" ON public.viatura_tipos
  FOR DELETE TO authenticated USING (org_id = get_current_org_id());
