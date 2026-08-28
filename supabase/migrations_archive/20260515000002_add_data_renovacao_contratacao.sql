-- Adicionar campo para renovação de contratação no motorista.
-- A data_contratacao representa o 1.º contrato e deve permanecer imutável após
-- definida. Renovações posteriores atualizam apenas data_renovacao_contratacao,
-- preservando o histórico da data original.

ALTER TABLE public.motoristas_ativos
  ADD COLUMN IF NOT EXISTS data_renovacao_contratacao date;

COMMENT ON COLUMN public.motoristas_ativos.data_renovacao_contratacao IS
  'Data da última renovação de contratação. A data_contratacao original mantém-se intocada.';
