-- ============================================================
-- TVDE: não criar evento de recolha automático
-- ============================================================
-- Para contratos rent-a-car a data_fim é conhecida à partida → o evento
-- de recolha faz sentido no calendário desde o início.
-- Para contratos TVDE a recolha é decidida quando o gestor fecha o
-- contrato (tipo: recolha ou devolução, data escolhida nesse momento).
-- Criar um evento de recolha na data_fim do primeiro período de faturação
-- é enganoso e gera ruído no calendário.
--
-- Solução: adicionar guard NEW.regime <> 'tvde' no bloco de recolha.
-- O resto da função é idêntico à versão 20260615000001.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula    text;
  v_cliente_nome text;
  v_descricao    text;
BEGIN
  -- Snapshot de dados úteis para o evento de calendário
  IF NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
    v_matricula := UPPER(REGEXP_REPLACE(v_matricula, '[\s-]', '', 'g'));
  END IF;
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = NEW.cliente_id;
  END IF;

  -- Descrição: observacoes_internas se preenchido, senão texto automático.
  v_descricao := COALESCE(
    NULLIF(TRIM(NEW.observacoes_internas), ''),
    'Gerado automaticamente pelo contrato #' || NEW.codigo
  );

  -- 1. Reserva → em_curso (se contrato foi gerado a partir de reserva)
  IF NEW.reserva_id IS NOT NULL THEN
    UPDATE public.reservas
       SET estado = 'em_curso'
     WHERE id = NEW.reserva_id
       AND estado IN ('confirmada', 'pendente');
  END IF;

  -- 2. Evento de entrega (data_inicio do contrato — todos os regimes)
  INSERT INTO public.calendario_eventos (
    tipo, titulo, descricao,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, criado_por,
    origem_tipo, origem_id
  )
  VALUES (
    'entrega',
    COALESCE(v_matricula, '?'),
    v_descricao,
    NEW.data_inicio, NEW.data_inicio, false,
    v_matricula, COALESCE(NEW.created_by, auth.uid()),
    'contrato_renting', NEW.id
  );

  -- 3. Evento de recolha (só para contratos não-TVDE).
  --    Em TVDE a recolha/devolução é decidida no fecho do contrato:
  --    o gestor escolhe o tipo (recolha ou devolução) e a data nesse momento.
  IF NEW.data_fim IS NOT NULL AND NEW.regime <> 'tvde' THEN
    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por,
      origem_tipo, origem_id
    )
    VALUES (
      'recolha',
      COALESCE(v_matricula, '?'),
      v_descricao,
      NEW.data_fim, NEW.data_fim, false,
      v_matricula, COALESCE(NEW.created_by, auth.uid()),
      'contrato_renting', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_open() IS
  'Cascata ao criar contrato_renting: avança reserva, ocupa viatura, gera eventos no calendário. '
  'TVDE não gera evento de recolha automático — a recolha/devolução é criada no fecho do contrato.';
