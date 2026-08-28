-- ============================================================
-- Fix: cascata de estado — manter eventos realizados no 'devolvido'
-- ============================================================
-- A cascata apagava os calendario_eventos derivados em QUALQUER transição
-- (cancelado E devolvido). Resultado: ao fazer o check-out (estado
-- 'devolvido'), os eventos de entrega/recolha desse contrato desapareciam
-- do calendário E do Relatório de Eventos — perdia-se o histórico.
--
-- Correção: só apagar quando o contrato é CANCELADO (compromisso que não se
-- concretizou). Em 'devolvido' os eventos já foram realizados (o trigger
-- trg_contrato_renting_cascata_realizacao marcou realizado_em) e devem
-- manter-se como registo histórico.
--
-- Idempotente (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo_estado_reserva text;
BEGIN
  -- Só age quando estado_operacional muda de facto.
  IF NEW.estado_operacional IS NOT DISTINCT FROM OLD.estado_operacional THEN
    RETURN NEW;
  END IF;

  -- Sem reserva associada, nada a cascatear (não devia acontecer mas
  -- defendemo-nos contra contratos legacy).
  IF NEW.reserva_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mapear nova transição → estado da reserva
  IF NEW.estado_operacional = 'cancelado' AND OLD.estado_operacional = 'agendado' THEN
    -- Cancelado antes da entrega: cliente continua com reserva válida.
    v_novo_estado_reserva := 'confirmada';
  ELSIF NEW.estado_operacional = 'cancelado' AND OLD.estado_operacional = 'em_curso' THEN
    -- Cancelado durante uso: terminar tudo.
    v_novo_estado_reserva := 'cancelada';
  ELSIF NEW.estado_operacional = 'devolvido' THEN
    -- Ciclo terminado naturalmente.
    v_novo_estado_reserva := 'concluida';
  ELSE
    -- Outras transições (ex. agendado→em_curso) não exigem cascata
    -- sobre a reserva — ela já está 'em_curso' desde o INSERT.
    RETURN NEW;
  END IF;

  -- Aplicar transição na reserva
  UPDATE public.reservas
     SET estado = v_novo_estado_reserva::reserva_estado_enum
   WHERE id = NEW.reserva_id;

  -- Apagar eventos derivados SÓ quando o contrato é cancelado (compromisso
  -- que não se concretizou). Em 'devolvido' os eventos já foram realizados e
  -- mantêm-se como histórico — é o que alimenta o Relatório de Eventos.
  IF NEW.estado_operacional = 'cancelado' THEN
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_estado() IS
  'Cascata inversa ao mudar estado_operacional: ajusta a reserva associada e, '
  'apenas quando CANCELADO, remove os eventos derivados. Em devolvido os '
  'eventos realizados mantêm-se (histórico do Relatório de Eventos).';

DROP TRIGGER IF EXISTS trg_contrato_renting_cascata_estado ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_cascata_estado
  AFTER UPDATE OF estado_operacional ON public.contratos_renting
  FOR EACH ROW
  EXECUTE FUNCTION public.contrato_renting_cascata_estado();
