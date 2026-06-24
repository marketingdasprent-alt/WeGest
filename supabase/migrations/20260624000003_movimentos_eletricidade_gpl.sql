-- Adiciona níveis de energia adaptativos a movimentos:
--   eletricidade_*  (bateria, ex.: '50%')  — elétricos/híbridos
--   gpl_*           (nível GPL, ex.: '1/4') — GPL/bi-fuel
-- combustivel_* (oitavos 0-8) mantém-se para combustão.
-- Idempotente.
ALTER TABLE public.movimentos
  ADD COLUMN IF NOT EXISTS eletricidade_inicial text,
  ADD COLUMN IF NOT EXISTS eletricidade_final   text,
  ADD COLUMN IF NOT EXISTS gpl_inicial          text,
  ADD COLUMN IF NOT EXISTS gpl_final            text;
