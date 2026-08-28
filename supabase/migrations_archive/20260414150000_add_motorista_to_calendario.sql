-- Add motorista_id to calendario_eventos so each event can be linked to a driver
ALTER TABLE public.calendario_eventos
  ADD COLUMN IF NOT EXISTS motorista_id UUID REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL;

-- Index for lookups by driver
CREATE INDEX IF NOT EXISTS idx_calendario_eventos_motorista
  ON public.calendario_eventos(motorista_id);
