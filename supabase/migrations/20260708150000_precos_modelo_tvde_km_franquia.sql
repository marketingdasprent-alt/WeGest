-- ============================================================
-- Preço por modelo (TVDE): km mensal, km adicional e franquia
-- ============================================================
-- A tabela renting_tarifa_precos_modelo já guardava o preço/semana
-- por modelo. Acrescenta os restantes valores da tabela de preços
-- TVDE (km incluídos/mês, custo por km extra, franquia), também
-- por modelo — cada modelo tem valores próprios nestas tarifas.
-- ============================================================

ALTER TABLE public.renting_tarifa_precos_modelo
  ADD COLUMN IF NOT EXISTS km_mensal          integer       CHECK (km_mensal IS NULL OR km_mensal >= 0),
  ADD COLUMN IF NOT EXISTS km_adicional_valor numeric(10,4) CHECK (km_adicional_valor IS NULL OR km_adicional_valor >= 0),
  ADD COLUMN IF NOT EXISTS franquia_valor     numeric(10,2) CHECK (franquia_valor IS NULL OR franquia_valor >= 0);

COMMENT ON COLUMN public.renting_tarifa_precos_modelo.km_mensal IS
  'Km incluídos por mês para este modelo nesta tarifa TVDE. NULL = não definido.';
COMMENT ON COLUMN public.renting_tarifa_precos_modelo.km_adicional_valor IS
  'Custo (€) por km extra além do km_mensal, para este modelo nesta tarifa TVDE.';
COMMENT ON COLUMN public.renting_tarifa_precos_modelo.franquia_valor IS
  'Franquia (€) aplicável a este modelo nesta tarifa TVDE.';
