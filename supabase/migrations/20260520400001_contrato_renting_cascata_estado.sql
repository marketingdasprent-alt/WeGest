-- ============================================================
-- Fase 2d — Cascata inversa ao mudar estado_operacional
-- ============================================================
-- O INSERT já cascateia (trg_contrato_renting_cascata_open): avança
-- reserva.estado para 'em_curso' e cria 2 eventos no calendário.
--
-- Falta a cascata para os UPDATEs de estado_operacional:
--
--   agendado → cancelado  → reserva volta a 'confirmada' (válida)
--                         + apagar eventos derivados
--   em_curso → cancelado  → reserva passa a 'cancelada'
--                         + apagar eventos derivados
--   em_curso → devolvido  → reserva passa a 'concluida'
--                         + apagar eventos derivados
--
-- viatura.status é recalculado pelo trg_contratos_disponibilidade
-- que já existe — não precisamos repetir aqui.
--
-- SECURITY DEFINER porque o trigger modifica reservas e eventos do
-- calendário sem exigir permissão directa do utilizador (a permissão
-- foi validada ao mexer no contrato).
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

  -- Limpar eventos derivados do calendário — já não representam
  -- compromissos válidos. Idempotente: se já foram apagados não acontece nada.
  DELETE FROM public.calendario_eventos
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_estado() IS
  'Cascata inversa ao mudar estado_operacional: ajusta reserva associada e remove eventos do calendário derivados.';

DROP TRIGGER IF EXISTS trg_contrato_renting_cascata_estado ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_cascata_estado
  AFTER UPDATE OF estado_operacional ON public.contratos_renting
  FOR EACH ROW
  EXECUTE FUNCTION public.contrato_renting_cascata_estado();
