-- ============================================================
-- Adicionar FKs de marca, modelo, combustível e tipo a renting_grupos
-- ============================================================
-- Substituir o campo texto `combustivel` por referência a tabela.
-- Adicionar marca_id, modelo_id, tipo_id para associar ao grupo.
-- ============================================================

-- 1. Remover CHECK constraint do campo combustivel antigo
ALTER TABLE public.renting_grupos DROP CONSTRAINT IF EXISTS renting_grupos_combustivel_check;

-- 2. Adicionar novas colunas FK
ALTER TABLE public.renting_grupos
  ADD COLUMN IF NOT EXISTS marca_id       uuid REFERENCES public.viatura_marcas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modelo_id      uuid REFERENCES public.viatura_modelos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS combustivel_id uuid REFERENCES public.viatura_combustiveis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_id        uuid REFERENCES public.viatura_tipos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_renting_grupos_marca       ON public.renting_grupos (marca_id);
CREATE INDEX IF NOT EXISTS idx_renting_grupos_modelo      ON public.renting_grupos (modelo_id);
CREATE INDEX IF NOT EXISTS idx_renting_grupos_combustivel ON public.renting_grupos (combustivel_id);
CREATE INDEX IF NOT EXISTS idx_renting_grupos_tipo        ON public.renting_grupos (tipo_id);

COMMENT ON COLUMN public.renting_grupos.marca_id IS 'Marca associada a este grupo (ex: Tesla).';
COMMENT ON COLUMN public.renting_grupos.modelo_id IS 'Modelo associado a este grupo (ex: Model 3).';
COMMENT ON COLUMN public.renting_grupos.combustivel_id IS 'Combustível pré-definido para este grupo.';
COMMENT ON COLUMN public.renting_grupos.tipo_id IS 'Tipo de viatura deste grupo (ex: Comercial, Ligeira TVDE).';
