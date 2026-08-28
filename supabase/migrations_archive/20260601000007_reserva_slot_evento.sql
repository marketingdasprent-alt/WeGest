-- ============================================================
-- Evento de SLOT no calendário (visível só no Relatório de Eventos)
-- ============================================================
-- A reserva slot não gera contrato (logo, não passa pela cascata que cria
-- eventos). Para aparecer no Relatório de Eventos, criamos aqui um evento
-- calendario_eventos de tipo='slot' ao inserir a reserva slot.
--
-- O grid do calendário filtra tipo='slot' no frontend (CalendarioGrid),
-- por isso o evento aparece APENAS no relatório, não no calendário.
-- Idempotente.
-- ============================================================

-- 1) Permitir 'slot' na CHECK de tipo
ALTER TABLE public.calendario_eventos
  DROP CONSTRAINT IF EXISTS calendario_eventos_tipo_check;

ALTER TABLE public.calendario_eventos
  ADD CONSTRAINT calendario_eventos_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'entrega', 'recolha', 'troca', 'upgrade',
    'transferencia', 'reparacao', 'manutencao', 'inspecao', 'impro',
    'devolucao', 'lista_espera',
    'slot'
  ]));

-- 2) Trigger: cria o evento slot ao inserir a reserva slot
CREATE OR REPLACE FUNCTION public.reserva_slot_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula     text;
  v_motorista_nome text;
BEGIN
  IF NEW.regime <> 'slot' THEN
    RETURN NEW;
  END IF;

  IF NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
  END IF;
  IF NEW.condutor_id IS NOT NULL THEN
    SELECT nome INTO v_motorista_nome FROM public.motoristas_ativos WHERE id = NEW.condutor_id;
  END IF;

  INSERT INTO public.calendario_eventos (
    tipo, titulo, descricao,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, motorista_id, criado_por,
    origem_tipo, origem_id
  )
  VALUES (
    'slot',
    'Slot — ' || COALESCE(v_matricula, '?') ||
      CASE WHEN v_motorista_nome IS NOT NULL THEN ' (' || v_motorista_nome || ')' ELSE '' END,
    'Slot — ' || COALESCE(v_motorista_nome, 'motorista') ||
      COALESCE(' · ' || NEW.slot_valor_semanal::text || ' €/sem', ''),
    NEW.data_inicio, NEW.data_inicio, false,
    v_matricula, NEW.condutor_id, COALESCE(NEW.created_by, auth.uid()),
    'reserva', NEW.id
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reserva_slot_evento() IS
  'Cria um evento calendario_eventos tipo=slot ao inserir uma reserva slot. Aparece só no Relatório (o grid filtra slot).';

DROP TRIGGER IF EXISTS trg_reserva_slot_evento ON public.reservas;
CREATE TRIGGER trg_reserva_slot_evento
  AFTER INSERT ON public.reservas
  FOR EACH ROW
  EXECUTE FUNCTION public.reserva_slot_evento();
