-- ============================================================
-- Inativar motorista principal quando a recolha é confirmada
-- ============================================================
-- Antes, a inactivação do motorista só acontecia no fecho imediato
-- via FecharContratoTVDEDialog (JS) — se a recolha física fosse
-- deixada pendente (registada só depois via QR/token), o motorista
-- nunca era marcado como inactivo. Este trigger cobre os dois
-- caminhos: fecho imediato (estado_operacional muda directamente
-- para o valor final) e confirmação tardia via
-- realizar_token_realizacao (idem, dispara o mesmo trigger).
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_inativar_motorista_na_devolucao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado_operacional IS NOT DISTINCT FROM OLD.estado_operacional THEN
    RETURN NEW;
  END IF;

  -- Só age quando o contrato termina de facto (recolha/devolução
  -- confirmada). 'cancelado' cobre o fecho manual TVDE hoje; 'devolvido'
  -- cobre o fluxo normal de recolha via token.
  IF NEW.estado_operacional NOT IN ('cancelado', 'devolvido') THEN
    RETURN NEW;
  END IF;

  UPDATE public.motoristas_ativos
     SET status_ativo = false
   WHERE id IN (
     SELECT motorista_id
       FROM public.contrato_condutores
      WHERE contrato_id = NEW.id
        AND motorista_id IS NOT NULL
   );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_renting_inativar_motorista ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_inativar_motorista
AFTER UPDATE OF estado_operacional ON public.contratos_renting
FOR EACH ROW EXECUTE FUNCTION public.contrato_renting_inativar_motorista_na_devolucao();

COMMENT ON FUNCTION public.contrato_renting_inativar_motorista_na_devolucao() IS
  'Marca motoristas_ativos.status_ativo=false para os condutores deste '
  'contrato quando ele termina (cancelado/devolvido) — cobre tanto o fecho '
  'imediato (FecharContratoTVDEDialog) como a confirmação tardia via '
  'realizar_token_realizacao, para a recolha física ficar pendente sem '
  'deixar o motorista activo indefinidamente por engano.';
