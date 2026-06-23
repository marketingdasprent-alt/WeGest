-- ============================================================
-- Bifurcação de condutores por regime: cliente_id | motorista_id
-- ============================================================
-- Até agora, `reserva_condutores` e `contrato_condutores` só
-- aceitavam clientes (FK para `clientes`). Em regime TVDE faz mais
-- sentido apontar para `motoristas` (parceiros internos), mantendo
-- os dois domínios separados.
--
-- Decisão (aprovada pelo user): adicionar `motorista_id` (nullable)
-- e tornar `cliente_id` nullable, com CHECK XOR — exactamente um
-- dos dois tem que estar preenchido.
--
-- Linhas existentes têm cliente_id preenchido — continuam válidas.
-- Migrations futuras de TVDE preenchem motorista_id.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) reserva_condutores
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.reserva_condutores
  ADD COLUMN IF NOT EXISTS motorista_id uuid
    REFERENCES public.motoristas(id) ON DELETE RESTRICT;

-- Cliente_id deixa de ser obrigatório (mas continua FK para clientes)
ALTER TABLE public.reserva_condutores
  ALTER COLUMN cliente_id DROP NOT NULL;

ALTER TABLE public.reserva_condutores
  DROP CONSTRAINT IF EXISTS reserva_condutores_xor_cliente_motorista;
ALTER TABLE public.reserva_condutores
  ADD CONSTRAINT reserva_condutores_xor_cliente_motorista
  CHECK ((cliente_id IS NULL) <> (motorista_id IS NULL));

-- O UNIQUE antigo (reserva_id, cliente_id) deixa de fazer sentido
-- — clientes podem ser NULL agora. Substituir por dois UNIQUE parciais.
ALTER TABLE public.reserva_condutores
  DROP CONSTRAINT IF EXISTS reserva_condutores_reserva_cliente_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_condutores_cliente_unico
  ON public.reserva_condutores (reserva_id, cliente_id)
  WHERE cliente_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_condutores_motorista_unico
  ON public.reserva_condutores (reserva_id, motorista_id)
  WHERE motorista_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reserva_condutores_motorista
  ON public.reserva_condutores (motorista_id)
  WHERE motorista_id IS NOT NULL;

COMMENT ON COLUMN public.reserva_condutores.motorista_id IS
  'Motorista parceiro (apenas TVDE). XOR com cliente_id — exactamente um '
  'dos dois é preenchido.';

-- ────────────────────────────────────────────────────────────
-- 2) contrato_condutores
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.contrato_condutores
  ADD COLUMN IF NOT EXISTS motorista_id uuid
    REFERENCES public.motoristas(id) ON DELETE RESTRICT;

ALTER TABLE public.contrato_condutores
  ALTER COLUMN cliente_id DROP NOT NULL;

ALTER TABLE public.contrato_condutores
  DROP CONSTRAINT IF EXISTS contrato_condutores_xor_cliente_motorista;
ALTER TABLE public.contrato_condutores
  ADD CONSTRAINT contrato_condutores_xor_cliente_motorista
  CHECK ((cliente_id IS NULL) <> (motorista_id IS NULL));

-- O EXCLUDE de sobreposição de vigências precisa de cobrir motorista_id
-- também. Mantemos o antigo (filtrado por cliente_id NOT NULL) e
-- acrescentamos um espelho para motorista_id.
ALTER TABLE public.contrato_condutores
  DROP CONSTRAINT IF EXISTS contrato_condutores_sem_sobreposicao;

ALTER TABLE public.contrato_condutores
  ADD CONSTRAINT contrato_condutores_sem_sobreposicao_cliente
  EXCLUDE USING gist (contrato_id WITH =, cliente_id WITH =, vigencia WITH &&)
  WHERE (cliente_id IS NOT NULL);

ALTER TABLE public.contrato_condutores
  DROP CONSTRAINT IF EXISTS contrato_condutores_sem_sobreposicao_motorista;
ALTER TABLE public.contrato_condutores
  ADD CONSTRAINT contrato_condutores_sem_sobreposicao_motorista
  EXCLUDE USING gist (contrato_id WITH =, motorista_id WITH =, vigencia WITH &&)
  WHERE (motorista_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_contrato_condutores_motorista
  ON public.contrato_condutores (motorista_id)
  WHERE motorista_id IS NOT NULL;

COMMENT ON COLUMN public.contrato_condutores.motorista_id IS
  'Motorista parceiro (apenas TVDE). XOR com cliente_id — exactamente um '
  'dos dois é preenchido.';
