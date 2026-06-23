-- ============================================================
-- Defesa: regime SLOT nunca gera contratos_renting
-- ============================================================
-- A reserva slot fica SÓ como reserva — o "contrato" do motorista é o
-- contrato de prestação de serviços (tabela contratos_prestacao).
-- Esta é a rede de segurança ao nível da BD: mesmo que a UI falhe,
-- a BD rejeita qualquer contrato_renting com regime='slot'.
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_rejeitar_contrato_slot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.regime = 'slot' THEN
    RAISE EXCEPTION 'Regime slot não gera contrato_renting — usa o contrato de prestação de serviços.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rejeitar_contrato_slot ON public.contratos_renting;

CREATE TRIGGER trg_rejeitar_contrato_slot
  BEFORE INSERT OR UPDATE OF regime ON public.contratos_renting
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_rejeitar_contrato_slot();
