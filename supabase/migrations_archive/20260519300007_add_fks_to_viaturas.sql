-- Adicionar marca_id, modelo_id, combustivel_id à tabela viaturas
-- As colunas texto (marca, modelo, combustivel) mantêm-se para backward compatibility.

ALTER TABLE public.viaturas
  ADD COLUMN IF NOT EXISTS marca_id       uuid REFERENCES public.viatura_marcas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modelo_id      uuid REFERENCES public.viatura_modelos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS combustivel_id uuid REFERENCES public.viatura_combustiveis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_viaturas_marca       ON public.viaturas (marca_id);
CREATE INDEX IF NOT EXISTS idx_viaturas_modelo      ON public.viaturas (modelo_id);
CREATE INDEX IF NOT EXISTS idx_viaturas_combustivel ON public.viaturas (combustivel_id);

COMMENT ON COLUMN public.viaturas.marca_id IS 'FK para viatura_marcas — substitui campo texto marca.';
COMMENT ON COLUMN public.viaturas.modelo_id IS 'FK para viatura_modelos — substitui campo texto modelo.';
COMMENT ON COLUMN public.viaturas.combustivel_id IS 'FK para viatura_combustiveis — substitui campo texto combustivel.';
