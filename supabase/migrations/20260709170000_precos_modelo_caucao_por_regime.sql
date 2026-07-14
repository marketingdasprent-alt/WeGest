-- ============================================================
-- Caução por modelo, separada por regime (TVDE vs Rent-a-Car)
-- ============================================================
-- Tal como os restantes campos por modelo, a caução é independente entre
-- os dois regimes: caucao_valor (TVDE) e caucao_valor_iva (Rent-a-Car).
-- O valor é puxado para o campo de caução da reserva/contrato.
-- ============================================================

ALTER TABLE public.renting_tarifa_precos_modelo
  ADD COLUMN IF NOT EXISTS caucao_valor     numeric(10,2) CHECK (caucao_valor IS NULL OR caucao_valor >= 0),
  ADD COLUMN IF NOT EXISTS caucao_valor_iva numeric(10,2) CHECK (caucao_valor_iva IS NULL OR caucao_valor_iva >= 0);

COMMENT ON COLUMN public.renting_tarifa_precos_modelo.caucao_valor IS
  'Caução (€) para este modelo nesta tarifa TVDE.';
COMMENT ON COLUMN public.renting_tarifa_precos_modelo.caucao_valor_iva IS
  'Caução (€) para este modelo nesta tarifa Rent-a-Car.';

-- ------------------------------------------------------------
-- Conveniência: na tarifa "TVDE - Base", a caução de cada modelo fica
-- igual ao valor do aluguer semanal (preco_semana). Idempotente.
-- ------------------------------------------------------------
UPDATE public.renting_tarifa_precos_modelo pm
   SET caucao_valor = pm.preco_semana, updated_at = now()
  FROM public.renting_tarifas t
 WHERE pm.tarifa_id = t.id
   AND t.nome = 'TVDE - Base'
   AND pm.preco_semana IS NOT NULL
   AND pm.caucao_valor IS DISTINCT FROM pm.preco_semana;
