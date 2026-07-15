-- ============================================================
-- Cascata em falta: evento de calendário realizado → avança o contrato
-- ============================================================
-- Existia só a cascata contrato→evento (trg_contrato_renting_cascata_realizacao:
-- ao mudar estado_operacional, marca o evento de entrega/recolha como realizado).
-- Faltava o sentido inverso: marcar um evento de entrega/recolha como realizado
-- DIRECTAMENTE no calendário (sem passar pela RPC realizar_token_realizacao)
-- não avançava o contrato — ficava preso em 'agendado' (entrega já feita) ou
-- 'em_curso' (recolha já feita), apesar do evento estar concluído.
--
-- Sem risco de recursão: quando este trigger corre, o evento já está realizado,
-- e a cascata inversa (contrato_renting_cascata_realizacao) só toca em eventos
-- com realizado_em IS NULL — logo é no-op no bounce. O guard no estado de
-- origem torna o UPDATE idempotente e evita transições indevidas (ex.: se o
-- contrato já foi avançado pela RPC do token, não faz nada).
-- ============================================================

CREATE OR REPLACE FUNCTION public.calendario_evento_cascata_contrato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_novo_estado    text;
  v_estado_origem  text;
BEGIN
  -- Só age quando o evento PASSA a realizado (NULL → not null).
  IF NEW.realizado_em IS NULL OR OLD.realizado_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Só eventos gerados por contratos de renting.
  IF NEW.origem_tipo <> 'contrato_renting' OR NEW.origem_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mapeia tipo de evento → transição do contrato (e estado de origem exigido).
  CASE NEW.tipo
    WHEN 'entrega' THEN v_estado_origem := 'agendado'; v_novo_estado := 'em_curso';
    WHEN 'recolha' THEN v_estado_origem := 'em_curso'; v_novo_estado := 'devolvido';
    ELSE RETURN NEW;  -- 'troca' e outros não mexem no estado_operacional
  END CASE;

  -- Avança o contrato só se estiver mesmo no estado de origem esperado —
  -- idempotente e seguro.
  UPDATE public.contratos_renting
     SET estado_operacional = v_novo_estado::contrato_estado_operacional_enum,
         updated_by         = COALESCE(NEW.realizado_por_id, updated_by)
   WHERE id                 = NEW.origem_id
     AND substituido_em     IS NULL
     AND deleted_at         IS NULL
     AND estado_operacional = v_estado_origem::contrato_estado_operacional_enum;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_calendario_evento_cascata_contrato ON public.calendario_eventos;
CREATE TRIGGER trg_calendario_evento_cascata_contrato
  AFTER UPDATE OF realizado_em ON public.calendario_eventos
  FOR EACH ROW
  EXECUTE FUNCTION public.calendario_evento_cascata_contrato();

-- ------------------------------------------------------------
-- Backfill: sarar os contratos de ENTREGA presos em 'agendado' com a entrega
-- já confirmada (Causa 2). Guardado ao estado de origem 'agendado' →
-- idempotente. NÃO toca em casos de recolha — fechar um contrato (+ concluir
-- reserva + desactivar motorista) é mais pesado e fica para decisão à parte.
-- ------------------------------------------------------------
UPDATE public.contratos_renting c
   SET estado_operacional = 'em_curso'::contrato_estado_operacional_enum
 WHERE c.estado_operacional = 'agendado'
   AND c.substituido_em IS NULL
   AND c.deleted_at IS NULL
   AND EXISTS (
     SELECT 1 FROM public.calendario_eventos e
      WHERE e.origem_tipo  = 'contrato_renting'
        AND e.origem_id    = c.id
        AND e.tipo         = 'entrega'
        AND e.realizado_em IS NOT NULL
   );
