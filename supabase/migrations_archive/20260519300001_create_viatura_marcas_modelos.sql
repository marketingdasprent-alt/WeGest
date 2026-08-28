-- ============================================================
-- Tabelas `viatura_marcas` e `viatura_modelos`
-- ============================================================
-- Catálogo de marcas e modelos de viaturas por organização.
-- Usados para padronizar dados nos grupos e fichas de viatura.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.viatura_marcas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome        text NOT NULL,  -- ex: "Tesla", "BMW", "Renault"
  ativa       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_viatura_marcas_org   ON public.viatura_marcas (org_id);
CREATE INDEX IF NOT EXISTS idx_viatura_marcas_ativa ON public.viatura_marcas (org_id, ativa);

CREATE OR REPLACE FUNCTION public.touch_viatura_marcas_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_viatura_marcas_updated_at ON public.viatura_marcas;
CREATE TRIGGER trg_viatura_marcas_updated_at
  BEFORE UPDATE ON public.viatura_marcas
  FOR EACH ROW EXECUTE FUNCTION public.touch_viatura_marcas_updated_at();

-- RLS
ALTER TABLE public.viatura_marcas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_viatura_marcas_select" ON public.viatura_marcas;
DROP POLICY IF EXISTS "mt_viatura_marcas_insert" ON public.viatura_marcas;
DROP POLICY IF EXISTS "mt_viatura_marcas_update" ON public.viatura_marcas;
DROP POLICY IF EXISTS "mt_viatura_marcas_delete" ON public.viatura_marcas;

CREATE POLICY "mt_viatura_marcas_select" ON public.viatura_marcas
  FOR SELECT TO authenticated USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_marcas_insert" ON public.viatura_marcas
  FOR INSERT TO authenticated WITH CHECK (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_marcas_update" ON public.viatura_marcas
  FOR UPDATE TO authenticated USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_marcas_delete" ON public.viatura_marcas
  FOR DELETE TO authenticated USING (org_id = get_current_org_id());

-- ============================================================
-- Modelos (filhos de marca)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.viatura_modelos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  marca_id    uuid NOT NULL REFERENCES public.viatura_marcas(id) ON DELETE CASCADE,
  nome        text NOT NULL,  -- ex: "Model 3", "Série 3", "Clio"
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_viatura_modelos_org   ON public.viatura_modelos (org_id);
CREATE INDEX IF NOT EXISTS idx_viatura_modelos_marca ON public.viatura_modelos (marca_id);

CREATE OR REPLACE FUNCTION public.touch_viatura_modelos_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_viatura_modelos_updated_at ON public.viatura_modelos;
CREATE TRIGGER trg_viatura_modelos_updated_at
  BEFORE UPDATE ON public.viatura_modelos
  FOR EACH ROW EXECUTE FUNCTION public.touch_viatura_modelos_updated_at();

-- RLS
ALTER TABLE public.viatura_modelos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_viatura_modelos_select" ON public.viatura_modelos;
DROP POLICY IF EXISTS "mt_viatura_modelos_insert" ON public.viatura_modelos;
DROP POLICY IF EXISTS "mt_viatura_modelos_update" ON public.viatura_modelos;
DROP POLICY IF EXISTS "mt_viatura_modelos_delete" ON public.viatura_modelos;

CREATE POLICY "mt_viatura_modelos_select" ON public.viatura_modelos
  FOR SELECT TO authenticated USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_modelos_insert" ON public.viatura_modelos
  FOR INSERT TO authenticated WITH CHECK (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_modelos_update" ON public.viatura_modelos
  FOR UPDATE TO authenticated USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_modelos_delete" ON public.viatura_modelos
  FOR DELETE TO authenticated USING (org_id = get_current_org_id());

COMMENT ON TABLE public.viatura_marcas IS 'Catálogo de marcas de viaturas por organização.';
COMMENT ON TABLE public.viatura_modelos IS 'Catálogo de modelos de viaturas, ligados a uma marca.';
