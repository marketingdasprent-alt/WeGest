-- ============================================================
-- Preço por modelo (Rent-a-Car): diária, mensal, km extra e franquia
-- ============================================================
-- A tabela renting_tarifa_precos_modelo já guardava os valores TVDE
-- (preco_semana, km_mensal, km_adicional_valor, franquia_valor).
-- Acrescenta colunas dedicadas para tarifas Rent-a-Car, onde o preço
-- passa a ser definido por modelo (tal como no TVDE) em vez de vir do
-- grupo. Semântica separada para evitar ambiguidade s/IVA vs c/IVA:
--   - preco_dia               → diária s/IVA
--   - preco_mes               → mensal s/IVA
--   - km_adicional_valor_iva  → custo por km extra c/IVA
--   - franquia_valor_iva      → franquia c/IVA
-- Uma tarifa usa as colunas TVDE OU as Rent-a-Car conforme o seu tipo.
-- Todos os valores são introduzidos manualmente.
-- ============================================================

ALTER TABLE public.renting_tarifa_precos_modelo
  ADD COLUMN IF NOT EXISTS preco_dia              numeric(10,2) CHECK (preco_dia IS NULL OR preco_dia >= 0),
  ADD COLUMN IF NOT EXISTS preco_mes              numeric(10,2) CHECK (preco_mes IS NULL OR preco_mes >= 0),
  ADD COLUMN IF NOT EXISTS km_adicional_valor_iva numeric(10,4) CHECK (km_adicional_valor_iva IS NULL OR km_adicional_valor_iva >= 0),
  ADD COLUMN IF NOT EXISTS franquia_valor_iva     numeric(10,2) CHECK (franquia_valor_iva IS NULL OR franquia_valor_iva >= 0);

-- preco_semana passa a poder ser NULL: nas tarifas Rent-a-Car o preço por
-- modelo é diário/mensal, não semanal, por isso a coluna semanal fica vazia.
ALTER TABLE public.renting_tarifa_precos_modelo
  ALTER COLUMN preco_semana DROP NOT NULL;

COMMENT ON COLUMN public.renting_tarifa_precos_modelo.preco_dia IS
  'Diária s/IVA para este modelo nesta tarifa Rent-a-Car. NULL = não definido.';
COMMENT ON COLUMN public.renting_tarifa_precos_modelo.preco_mes IS
  'Mensal s/IVA para este modelo nesta tarifa Rent-a-Car. NULL = não definido.';
COMMENT ON COLUMN public.renting_tarifa_precos_modelo.km_adicional_valor_iva IS
  'Custo (€) por km extra c/IVA para este modelo nesta tarifa Rent-a-Car.';
COMMENT ON COLUMN public.renting_tarifa_precos_modelo.franquia_valor_iva IS
  'Franquia (€) c/IVA aplicável a este modelo nesta tarifa Rent-a-Car.';

-- ------------------------------------------------------------
-- grupo_id passa a poder ser NULL em renting_tarifas: as tarifas com
-- preço por modelo (TVDE e a nova Rent-a-Car geral) não pertencem a um
-- grupo específico. A constraint NOT NULL impedia guardar estas tarifas.
-- ------------------------------------------------------------
ALTER TABLE public.renting_tarifas
  ALTER COLUMN grupo_id DROP NOT NULL;

-- Pelo mesmo motivo, preco_dia (preço/dia global do grupo) pode ser NULL:
-- nas tarifas por modelo o preço vem de renting_tarifa_precos_modelo.
ALTER TABLE public.renting_tarifas
  ALTER COLUMN preco_dia DROP NOT NULL;

-- ------------------------------------------------------------
-- Correção de configuração: o tipo de viatura "TVDE" deve estar
-- marcado como elegível para TVDE. Estava a false, o que impedia a
-- derivação correta dos modelos elegíveis (que filtra por
-- viatura_tipos.elegivel_tvde). Idempotente.
-- ------------------------------------------------------------
UPDATE public.viatura_tipos
   SET elegivel_tvde = true, updated_at = now()
 WHERE nome = 'TVDE'
   AND elegivel_tvde = false;
