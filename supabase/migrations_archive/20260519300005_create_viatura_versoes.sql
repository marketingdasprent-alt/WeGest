-- ============================================================
-- Tabela `viatura_versoes` (filha de viatura_modelos)
-- ============================================================
-- Ex: Tesla > Model 3 > Long Range, Standard Range Plus
-- ============================================================

CREATE TABLE IF NOT EXISTS public.viatura_versoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  modelo_id   uuid NOT NULL REFERENCES public.viatura_modelos(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_viatura_versoes_org    ON public.viatura_versoes (org_id);
CREATE INDEX IF NOT EXISTS idx_viatura_versoes_modelo ON public.viatura_versoes (modelo_id);

CREATE OR REPLACE FUNCTION public.touch_viatura_versoes_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_viatura_versoes_updated_at ON public.viatura_versoes;
CREATE TRIGGER trg_viatura_versoes_updated_at
  BEFORE UPDATE ON public.viatura_versoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_viatura_versoes_updated_at();

-- RLS
ALTER TABLE public.viatura_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mt_viatura_versoes_select" ON public.viatura_versoes
  FOR SELECT TO authenticated USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_versoes_insert" ON public.viatura_versoes
  FOR INSERT TO authenticated WITH CHECK (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_versoes_update" ON public.viatura_versoes
  FOR UPDATE TO authenticated USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_versoes_delete" ON public.viatura_versoes
  FOR DELETE TO authenticated USING (org_id = get_current_org_id());

-- FK no renting_grupos
ALTER TABLE public.renting_grupos
  ADD COLUMN IF NOT EXISTS versao_id uuid REFERENCES public.viatura_versoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_renting_grupos_versao ON public.renting_grupos (versao_id);

COMMENT ON TABLE public.viatura_versoes IS 'Versões/acabamentos de modelos de viaturas (ex: Long Range, GTI, Sport).';
COMMENT ON COLUMN public.renting_grupos.versao_id IS 'Versão/acabamento associado a este grupo.';
