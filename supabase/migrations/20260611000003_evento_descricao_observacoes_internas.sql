-- ============================================================
-- Usar observacoes_internas do contrato como descrição do evento
-- + normalizar matrícula (maiúsculas, sem espaços/hífens)
-- ============================================================
-- Quando o trigger contrato_renting_cascata_open() gera eventos
-- de calendário:
--   1. Se o contrato tiver observacoes_internas preenchido,
--      esse texto passa a ser a descrição do evento.
--      Senão, mantém o texto automático actual.
--   2. A matrícula é normalizada (UPPER + remoção de espaços e
--      hífens) para consistência com o frontend (formatMatricula).
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula text;
  v_cliente_nome text;
  v_descricao text;
BEGIN
  -- Snapshot de dados úteis para o evento de calendário
  IF NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
    v_matricula := UPPER(REGEXP_REPLACE(v_matricula, '[\s-]', '', 'g'));
  END IF;
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = NEW.cliente_id;
  END IF;

  -- Descrição: observacoes_internas se preenchido, senão texto automático
  v_descricao := COALESCE(NULLIF(TRIM(NEW.observacoes_internas), ''), 'Gerado automaticamente pelo contrato #' || NEW.codigo);

  -- 1. Reserva → em_curso (se contrato foi gerado a partir de reserva)
  IF NEW.reserva_id IS NOT NULL THEN
    UPDATE public.reservas
       SET estado = 'em_curso'
     WHERE id = NEW.reserva_id
       AND estado IN ('confirmada', 'pendente');
  END IF;

  -- (viaturas.status é tratado por trg_contratos_disponibilidade →
  --  recalcular_disponibilidade_viatura, que corre logo após este trigger.)

  -- 2. Evento de entrega (data_inicio do contrato)
  INSERT INTO public.calendario_eventos (
    tipo, titulo, descricao,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, criado_por
  )
  VALUES (
    'entrega',
    'Entrega — ' || COALESCE(v_matricula, '?') ||
      CASE WHEN v_cliente_nome IS NOT NULL THEN ' (' || v_cliente_nome || ')' ELSE '' END,
    v_descricao,
    NEW.data_inicio, NEW.data_inicio, false,
    v_matricula, COALESCE(NEW.created_by, auth.uid())
  );

  -- 3. Evento de recolha (data_fim do contrato — se existir)
  IF NEW.data_fim IS NOT NULL THEN
    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por
    )
    VALUES (
      'recolha',
      'Recolha — ' || COALESCE(v_matricula, '?') ||
        CASE WHEN v_cliente_nome IS NOT NULL THEN ' (' || v_cliente_nome || ')' ELSE '' END,
      v_descricao,
      NEW.data_fim, NEW.data_fim, false,
      v_matricula, COALESCE(NEW.created_by, auth.uid())
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_open() IS
  'Cascata ao criar contrato_renting: avança reserva, ocupa viatura, gera eventos no calendário. A descrição do evento usa observacoes_internas do contrato quando preenchido.';
