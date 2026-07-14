-- ============================================================
-- Km incluídos por mês dedicado ao Rent-a-Car (km_mensal_iva)
-- ============================================================
-- As tarifas TVDE e Rent-a-Car são independentes: cada regime tem os
-- seus próprios campos por modelo e editar um não pode afetar o outro.
-- Até aqui o "km incluídos/mês" partilhava a coluna km_mensal com o
-- TVDE, o que fazia os valores vazarem entre regimes. Esta coluna
-- dedicada separa-os por completo.
-- ============================================================

ALTER TABLE public.renting_tarifa_precos_modelo
  ADD COLUMN IF NOT EXISTS km_mensal_iva integer CHECK (km_mensal_iva IS NULL OR km_mensal_iva >= 0);

COMMENT ON COLUMN public.renting_tarifa_precos_modelo.km_mensal_iva IS
  'Km incluídos por mês para este modelo nesta tarifa Rent-a-Car. Separado do km_mensal (TVDE).';
