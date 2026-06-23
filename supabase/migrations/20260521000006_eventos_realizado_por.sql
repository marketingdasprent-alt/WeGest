-- ============================================================
-- Eventos de calendário: quem realizou e quando
-- ============================================================
-- Modelo "pool de trabalho": o contrato é criado sem transferista
-- atribuído. Os eventos de entrega/recolha ficam visíveis a toda
-- a org. Quando alguém executa a operação física (check-in da
-- entrega ou recolha), o evento regista quem foi e em que momento.
--
-- Isto permite que qualquer colaborador (transferista ou gestor)
-- possa atender o evento. Não há atribuição prévia rígida.
-- ============================================================

ALTER TABLE public.calendario_eventos
  ADD COLUMN IF NOT EXISTS realizado_por_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS realizado_em timestamptz;

COMMENT ON COLUMN public.calendario_eventos.realizado_por_id IS
  'User que realizou fisicamente a operação (check-in da entrega/recolha). '
  'NULL = ainda pendente. Preenchido implicitamente quando o evento é executado.';

COMMENT ON COLUMN public.calendario_eventos.realizado_em IS
  'Timestamp em que a operação física foi confirmada. Independente de '
  'data_inicio/data_fim (que são o agendado).';

CREATE INDEX IF NOT EXISTS idx_calendario_eventos_pendentes
  ON public.calendario_eventos (data_inicio)
  WHERE realizado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_calendario_eventos_realizado_por
  ON public.calendario_eventos (realizado_por_id)
  WHERE realizado_por_id IS NOT NULL;

-- ============================================================
-- Trigger: propagar realização do contrato → evento de calendário
-- ============================================================
-- Quando o user clica "Entregar" (estado_operacional agendado→em_curso),
-- marca o evento 'entrega' deste contrato como realizado por quem
-- carregou no botão.
-- Quando clica "Devolver" (em_curso→devolvido), marca a 'recolha'.
-- Quando cancela, deixa os eventos sem realização (já são apagados
-- pelo trigger contrato_renting_cascata_estado).
-- ============================================================
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_realizacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento_tipo text;
  v_actor       uuid;
BEGIN
  -- Só age em transições de estado_operacional
  IF NEW.estado_operacional IS NOT DISTINCT FROM OLD.estado_operacional THEN
    RETURN NEW;
  END IF;

  -- Mapeia transição → tipo de evento a marcar realizado
  v_evento_tipo := CASE
    WHEN OLD.estado_operacional = 'agendado'  AND NEW.estado_operacional = 'em_curso'  THEN 'entrega'
    WHEN OLD.estado_operacional = 'em_curso'  AND NEW.estado_operacional = 'devolvido' THEN 'recolha'
    ELSE NULL
  END;

  IF v_evento_tipo IS NULL THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(NEW.updated_by, auth.uid());

  -- Marca o evento pendente correspondente. Se houver mais que um
  -- (não deveria), só toca no que ainda está por realizar.
  UPDATE public.calendario_eventos
     SET realizado_por_id = v_actor,
         realizado_em     = now()
   WHERE origem_tipo      = 'contrato_renting'
     AND origem_id        = NEW.id
     AND tipo             = v_evento_tipo
     AND realizado_em     IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_renting_cascata_realizacao ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_cascata_realizacao
AFTER UPDATE OF estado_operacional ON public.contratos_renting
FOR EACH ROW EXECUTE FUNCTION public.contrato_renting_cascata_realizacao();

COMMENT ON FUNCTION public.contrato_renting_cascata_realizacao() IS
  'Propaga transições de estado_operacional do contrato para o evento '
  'de calendário correspondente: agendado→em_curso marca entrega como '
  'realizada; em_curso→devolvido marca recolha. Quem realiza = updated_by.';

-- ============================================================
-- Ajuste em cascata_estado: NÃO apagar eventos em devolução
-- ============================================================
-- A versão anterior apagava todos os eventos do contrato quando o
-- estado passava a 'devolvido'. Isso destrói o histórico de quem
-- realizou a recolha — agora queremos manter os eventos marcados
-- como `realizado_em` para auditoria.
-- Em cancelamento o DELETE continua a fazer sentido (eventos
-- pendentes que nunca vão acontecer).
-- ============================================================
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo_estado_reserva text;
  v_deve_apagar_eventos boolean := false;
BEGIN
  IF NEW.estado_operacional IS NOT DISTINCT FROM OLD.estado_operacional THEN
    RETURN NEW;
  END IF;

  IF NEW.reserva_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.estado_operacional = 'cancelado' AND OLD.estado_operacional = 'agendado' THEN
    v_novo_estado_reserva := 'confirmada';
    v_deve_apagar_eventos := true;
  ELSIF NEW.estado_operacional = 'cancelado' AND OLD.estado_operacional = 'em_curso' THEN
    v_novo_estado_reserva := 'cancelada';
    v_deve_apagar_eventos := true;
  ELSIF NEW.estado_operacional = 'devolvido' THEN
    -- Devolução natural: a reserva fica concluída e os eventos
    -- ficam no calendário com `realizado_em` preenchido (audit).
    v_novo_estado_reserva := 'concluida';
    v_deve_apagar_eventos := false;
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.reservas
     SET estado = v_novo_estado_reserva::reserva_estado_enum
   WHERE id = NEW.reserva_id;

  IF v_deve_apagar_eventos THEN
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
