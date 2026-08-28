-- ============================================================
-- Tabela `viatura_combustiveis`
-- ============================================================
-- Catálogo de tipos de combustível por organização.
-- Substitui as constantes hardcoded nos formulários.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.viatura_combustiveis (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome        text NOT NULL,  -- ex: "Elétrico", "Gasolina", "Diesel"
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_viatura_combustiveis_org   ON public.viatura_combustiveis (org_id);
CREATE INDEX IF NOT EXISTS idx_viatura_combustiveis_ativo ON public.viatura_combustiveis (org_id, ativo);

CREATE OR REPLACE FUNCTION public.touch_viatura_combustiveis_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_viatura_combustiveis_updated_at ON public.viatura_combustiveis;
CREATE TRIGGER trg_viatura_combustiveis_updated_at
  BEFORE UPDATE ON public.viatura_combustiveis
  FOR EACH ROW EXECUTE FUNCTION public.touch_viatura_combustiveis_updated_at();

-- RLS
ALTER TABLE public.viatura_combustiveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_viatura_combustiveis_select" ON public.viatura_combustiveis;
DROP POLICY IF EXISTS "mt_viatura_combustiveis_insert" ON public.viatura_combustiveis;
DROP POLICY IF EXISTS "mt_viatura_combustiveis_update" ON public.viatura_combustiveis;
DROP POLICY IF EXISTS "mt_viatura_combustiveis_delete" ON public.viatura_combustiveis;

CREATE POLICY "mt_viatura_combustiveis_select" ON public.viatura_combustiveis
  FOR SELECT TO authenticated USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_combustiveis_insert" ON public.viatura_combustiveis
  FOR INSERT TO authenticated WITH CHECK (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_combustiveis_update" ON public.viatura_combustiveis
  FOR UPDATE TO authenticated USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_combustiveis_delete" ON public.viatura_combustiveis
  FOR DELETE TO authenticated USING (org_id = get_current_org_id());

COMMENT ON TABLE public.viatura_combustiveis IS 'Catálogo de tipos de combustível por organização.';
