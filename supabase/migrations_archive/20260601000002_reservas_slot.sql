-- ============================================================
-- Reservas — suporte ao regime SLOT
-- ============================================================
-- • slot_valor_semanal: valor semanal cobrado ao motorista, POR CARRO
--   (default vem de motoristas_ativos.slot_valor_semanal, editável).
-- • data_fim passa a aceitar NULL: as reservas slot são abertas
--   (como TVDE), sem data de fim.
--
-- O CHECK reservas_periodo_valido (data_fim > data_inicio) mantém-se
-- válido: com data_fim NULL a comparação dá UNKNOWN e o CHECK passa.
-- Idempotente.
-- ============================================================

ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS slot_valor_semanal numeric(10,2);

COMMENT ON COLUMN public.reservas.slot_valor_semanal IS
  'Valor semanal cobrado ao motorista no regime slot (por carro). NULL fora do regime slot.';

ALTER TABLE public.reservas
  ALTER COLUMN data_fim DROP NOT NULL;
