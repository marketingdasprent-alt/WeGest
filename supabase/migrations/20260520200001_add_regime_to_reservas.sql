-- ============================================================
-- Adicionar `regime` (rent-a-car vs TVDE) à reserva
-- ============================================================
-- O regime é escolhido já na reserva e transita para o contrato
-- quando a reserva é convertida. Usa o mesmo enum do contrato.
-- ============================================================

ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS regime public.contrato_regime_enum NOT NULL DEFAULT 'rent_a_car';

COMMENT ON COLUMN public.reservas.regime IS
  'rent_a_car ou tvde. Escolhido na reserva; transita para o contrato gerado.';
