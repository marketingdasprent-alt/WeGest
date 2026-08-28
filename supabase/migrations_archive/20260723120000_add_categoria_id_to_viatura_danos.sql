-- Categoria de dano (ex.: Sinistro) — reutiliza assistencia_categorias,
-- já usada para categorizar tickets de assistência. Sem tabela nova.
ALTER TABLE public.viatura_danos
ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES public.assistencia_categorias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_viatura_danos_categoria ON public.viatura_danos(categoria_id);

COMMENT ON COLUMN public.viatura_danos.categoria_id IS 'Categoria do dano (ex.: Sinistro), partilhada com assistencia_categorias.';
