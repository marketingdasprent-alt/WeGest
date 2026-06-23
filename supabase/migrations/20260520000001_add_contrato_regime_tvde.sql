-- ============================================================
-- M1 — Regime de contrato (rent-a-car vs TVDE) + habilitação TVDE
-- ============================================================
-- Suporte ao modelo dual de aluguer:
--   • rent_a_car — tarifa diária/mensal, período FIXO, uma fatura
--   • tvde       — tarifa semanal, contrato ABERTO/recorrente
--
-- Decisões de negócio (ver desenho Renting/TVDE):
--   • "Ser TVDE" é do CONTRATO (campo `regime`), não da viatura.
--   • A viatura só tem o flag fixo `habilitada_tvde` (papelada legal),
--     que autoriza ou não a escolha do regime tvde no contrato.
--   • Contrato tvde pode não ter fim → `data_fim` passa a aceitar NULL.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Enum de regime
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.contrato_regime_enum AS ENUM ('rent_a_car', 'tvde');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- 2. Viatura — habilitada para TVDE (dístico, seguro, registo IMT)
-- ------------------------------------------------------------
ALTER TABLE public.viaturas
  ADD COLUMN IF NOT EXISTS habilitada_tvde boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.viaturas.habilitada_tvde IS
  'Viatura tem dístico TVDE, seguro e registo IMT. Só viaturas habilitadas '
  'podem entrar em contratos de regime tvde. Característica fixa do carro.';

-- ------------------------------------------------------------
-- 3. Contrato — regime
-- ------------------------------------------------------------
ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS regime public.contrato_regime_enum NOT NULL DEFAULT 'rent_a_car';

CREATE INDEX IF NOT EXISTS idx_contratos_renting_regime
  ON public.contratos_renting (org_id, regime) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.contratos_renting.regime IS
  'rent_a_car = tarifa diária/mensal, período fixo. '
  'tvde = tarifa semanal, contrato aberto/recorrente. Escolhe a coluna de preço da tarifa.';

-- ------------------------------------------------------------
-- 4. data_fim passa a aceitar NULL (contrato TVDE aberto, sem fim)
-- ------------------------------------------------------------
ALTER TABLE public.contratos_renting
  ALTER COLUMN data_fim DROP NOT NULL;

-- O CHECK antigo (data_fim > data_inicio) rejeita NULL — recriar permitindo.
-- A coluna gerada `periodo` = tstzrange(data_inicio, data_fim) fica com
-- limite superior infinito quando data_fim é NULL — EXCLUDE anti-overbooking
-- continua válido (dois contratos abertos na mesma viatura sobrepõem-se).
ALTER TABLE public.contratos_renting
  DROP CONSTRAINT IF EXISTS chk_contratos_periodo_valido;

ALTER TABLE public.contratos_renting
  ADD CONSTRAINT chk_contratos_periodo_valido
  CHECK (data_fim IS NULL OR data_fim > data_inicio);

COMMENT ON COLUMN public.contratos_renting.data_fim IS
  'Fim do contrato. NULL = contrato aberto/recorrente (típico tvde). '
  'Quando NULL, a coluna gerada `periodo` fica com limite superior infinito.';
