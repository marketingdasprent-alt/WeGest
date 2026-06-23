-- ============================================================
-- Faturação de RESERVAS — cobranças ligadas a uma reserva
-- ============================================================
-- Permite faturar uma reserva ANTES de abrir o contrato (ex.: o cliente
-- paga o carro antes de o levantar). A cobrança fica ligada à reserva
-- (reserva_id) em vez do contrato. Quando a reserva é convertida em
-- contrato, este HERDA as cobranças (trigger), sem refaturar.
--
-- A conta-corrente continua a ser a fonte de verdade; os triggers de
-- movimento (fn_cobranca_posta_movimento) e de proteção SAF-T
-- (fn_contrato_cobranca_protege) já funcionam com contrato_id nulo.
-- ============================================================

-- 1) contrato_id passa a opcional; nova ligação a reserva.
ALTER TABLE public.contrato_cobrancas
  ALTER COLUMN contrato_id DROP NOT NULL;

ALTER TABLE public.contrato_cobrancas
  ADD COLUMN IF NOT EXISTS reserva_id uuid REFERENCES public.reservas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_contrato_cobrancas_reserva
  ON public.contrato_cobrancas (reserva_id) WHERE reserva_id IS NOT NULL;

-- Uma cobrança pertence a um contrato OU a uma reserva (pelo menos um).
ALTER TABLE public.contrato_cobrancas
  DROP CONSTRAINT IF EXISTS chk_contrato_cobrancas_alvo;
ALTER TABLE public.contrato_cobrancas
  ADD CONSTRAINT chk_contrato_cobrancas_alvo
  CHECK (contrato_id IS NOT NULL OR reserva_id IS NOT NULL);

-- 2) org_id: derivar do contrato OU da reserva.
CREATE OR REPLACE FUNCTION public.set_contrato_cobranca_org_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    IF NEW.contrato_id IS NOT NULL THEN
      SELECT org_id INTO NEW.org_id FROM public.contratos_renting WHERE id = NEW.contrato_id;
    ELSIF NEW.reserva_id IS NOT NULL THEN
      SELECT org_id INTO NEW.org_id FROM public.reservas WHERE id = NEW.reserva_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Conversão reserva → contrato: o contrato herda as cobranças da reserva.
--    Se a reserva já tinha cobrança emitida/paga, o contrato nasce facturado
--    (não volta a faturar). contratos_renting.reserva_id já existe.
CREATE OR REPLACE FUNCTION public.fn_contrato_herda_cobrancas_reserva()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tem boolean;
BEGIN
  IF NEW.reserva_id IS NOT NULL THEN
    UPDATE public.contrato_cobrancas
       SET contrato_id = NEW.id
     WHERE reserva_id = NEW.reserva_id
       AND contrato_id IS NULL;

    SELECT EXISTS (
      SELECT 1 FROM public.contrato_cobrancas
       WHERE contrato_id = NEW.id AND estado IN ('emitida', 'paga')
    ) INTO v_tem;

    IF v_tem THEN
      UPDATE public.contratos_renting
         SET estado_financeiro = 'facturado'
       WHERE id = NEW.id AND estado_financeiro = 'pendente';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_herda_cobrancas_reserva ON public.contratos_renting;
CREATE TRIGGER trg_contrato_herda_cobrancas_reserva
  AFTER INSERT ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_herda_cobrancas_reserva();

COMMENT ON COLUMN public.contrato_cobrancas.reserva_id IS
  'Cobrança de faturação antecipada de uma reserva (antes de existir contrato). '
  'Ao criar o contrato a partir da reserva, a cobrança é herdada (contrato_id preenchido).';
