-- ============================================================
-- Faturação mensal de SLOT — schema
-- ============================================================
-- Idempotente. Aplicar à mão no SQL editor.
-- ============================================================

-- 1) Valor mensal BRUTO (com IVA) do slot, por reserva.
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS slot_valor_mensal numeric(10,2);

COMMENT ON COLUMN public.reservas.slot_valor_mensal IS
  'Valor mensal BRUTO (IVA incluído) cobrado ao motorista no regime slot. NULL fora do regime slot.';

-- 2) Cache da ponte motorista → cliente fiscal (tipo condutor).
ALTER TABLE public.motoristas_ativos
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.motoristas_ativos.cliente_id IS
  'Cliente fiscal (tipo=condutor) que representa este motorista nas cobranças de slot. '
  'Preenchido automaticamente por fn_ensure_cliente_condutor.';

-- 3) Distinguir cobranças de slot mensal das semanais TVDE.
ALTER TABLE public.contrato_cobrancas
  ADD COLUMN IF NOT EXISTS tipo_cobranca text NOT NULL DEFAULT 'tvde_semanal';

DO $$ BEGIN
  ALTER TABLE public.contrato_cobrancas
    ADD CONSTRAINT contrato_cobrancas_tipo_chk
    CHECK (tipo_cobranca IN ('tvde_semanal', 'slot_mensal'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4) Idempotência das cobranças de slot: uma por (reserva, período), exceto anuladas.
CREATE UNIQUE INDEX IF NOT EXISTS contrato_cobrancas_slot_periodo_unico
  ON public.contrato_cobrancas (reserva_id, periodo_de, periodo_ate)
  WHERE tipo_cobranca = 'slot_mensal' AND estado <> 'anulada';
