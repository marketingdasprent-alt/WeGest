-- Ticket de assistência activo (aberto, em andamento ou a aguardar) põe a viatura em manutenção.
--
-- A 14/10/2026 três viaturas na oficina (BN-29-MM, BI-83-LB, BI-37-LC) apareciam "disponíveis":
-- só o botão "Aceitar" da página do ticket mudava o estado da viatura; mudar o estado pela lista,
-- atribuir a si, ou abrir o ticket deixavam-na como estava. A regra passa a viver aqui e vale para
-- qualquer caminho. Quando o último ticket activo da viatura fecha, o estado é reposto:
-- em_uso se tem motorista ou contrato em curso; senão o que os contratos e reservas ditarem.
-- Estados fora de operação (inativo, vendida, em_recolha) nunca são tocados.

CREATE OR REPLACE FUNCTION public.ticket_estados_ativos()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT ARRAY['aberto', 'em_andamento', 'aguardando'];
$function$;

-- Liberta a viatura se já não tiver nenhum ticket activo. Só mexe se estiver em manutenção.
CREATE OR REPLACE FUNCTION public.viatura_libertar_sem_tickets(p_viatura_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_viatura_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.assistencia_tickets t
     WHERE t.viatura_id = p_viatura_id
       AND t.status = ANY (public.ticket_estados_ativos())
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.viaturas v WHERE v.id = p_viatura_id AND v.status = 'manutencao') THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.motorista_viaturas mv
     WHERE mv.viatura_id = p_viatura_id AND mv.status = 'ativo' AND mv.data_fim IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.contratos_renting c
     WHERE c.viatura_id = p_viatura_id AND c.deleted_at IS NULL AND c.substituido_em IS NULL
       AND c.estado_operacional = 'em_curso'
  ) THEN
    UPDATE public.viaturas SET status = 'em_uso' WHERE id = p_viatura_id;
    RETURN;
  END IF;

  -- Sem ninguém com o carro: disponível, ou reservada se houver contrato agendado ou reserva.
  UPDATE public.viaturas SET status = 'disponivel' WHERE id = p_viatura_id;
  PERFORM public.recalcular_disponibilidade_viatura(p_viatura_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.viatura_libertar_sem_tickets(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_ticket_sincroniza_estado_viatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.viatura_libertar_sem_tickets(OLD.viatura_id);
    RETURN OLD;
  END IF;

  IF NEW.viatura_id IS NOT NULL AND NEW.status = ANY (public.ticket_estados_ativos()) THEN
    UPDATE public.viaturas
       SET status = 'manutencao'
     WHERE id = NEW.viatura_id
       AND status IN ('disponivel', 'em_uso', 'reservada');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Deixou de estar activo, ou mudou de viatura: a antiga pode ficar livre.
    IF OLD.viatura_id IS DISTINCT FROM NEW.viatura_id THEN
      PERFORM public.viatura_libertar_sem_tickets(OLD.viatura_id);
    END IF;
    IF NOT (NEW.status = ANY (public.ticket_estados_ativos())) THEN
      PERFORM public.viatura_libertar_sem_tickets(NEW.viatura_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ticket_sincroniza_estado_viatura() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ticket_sincroniza_estado_viatura ON public.assistencia_tickets;
CREATE TRIGGER trg_ticket_sincroniza_estado_viatura
  AFTER INSERT OR DELETE OR UPDATE OF status, viatura_id ON public.assistencia_tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_ticket_sincroniza_estado_viatura();

-- Acerto inicial: viaturas com ticket activo que ainda constam como disponíveis, em uso ou reservadas.
UPDATE public.viaturas v
   SET status = 'manutencao'
 WHERE v.status IN ('disponivel', 'em_uso', 'reservada')
   AND EXISTS (
     SELECT 1 FROM public.assistencia_tickets t
      WHERE t.viatura_id = v.id AND t.status = ANY (public.ticket_estados_ativos())
   );

NOTIFY pgrst, 'reload schema';
