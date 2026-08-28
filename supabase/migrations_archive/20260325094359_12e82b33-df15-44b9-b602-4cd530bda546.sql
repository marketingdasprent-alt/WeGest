
ALTER TABLE public.bolt_resumos_semanais
  ADD COLUMN IF NOT EXISTS periodo_inicio date,
  ADD COLUMN IF NOT EXISTS periodo_fim date;

-- Backfill existing records: periodo=2026-03-24 → real week 2026-03-16 to 2026-03-22
UPDATE public.bolt_resumos_semanais
SET periodo_inicio = '2026-03-16'::date,
    periodo_fim = '2026-03-22'::date
WHERE periodo = '2026-03-24'
  AND periodo_inicio IS NULL;
