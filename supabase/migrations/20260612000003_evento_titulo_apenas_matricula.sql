-- ============================================================
-- Evento de calendário: titulo = APENAS a matrícula
-- ============================================================
-- Regressão introduzida em 20260611000003: o trigger passou a gravar
-- um título composto ('Entrega — AN29RF (Cliente)') no campo `titulo`.
-- O frontend (EventoDialog) trata `titulo` como a matrícula pura —
-- lê com formatMatricula(evento.titulo) e grava
-- matricula.replace(/[-\s]/g,'') — pelo que o título composto aparece
-- com traços a cada 2 caracteres (ex.: "EN-TR-EG-A—-AN-29-RF-(...)").
--
-- Correção:
--   1. titulo volta a ser apenas a matrícula normalizada (v_matricula),
--      consistente com `matricula_devolver` e com o frontend. O texto
--      descritivo continua em `descricao` (observacoes_internas / auto).
--   2. Backfill dos eventos já gerados com título composto, repondo
--      titulo = matricula_devolver (que já contém a matrícula limpa).
--
-- Idempotente: CREATE OR REPLACE + UPDATE com guarda no padrão do título.
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

  -- Descrição: observacoes_internas se preenchido, senão texto automático.
  -- (O nome do cliente, antes no título, mantém-se disponível via contrato.)
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
    COALESCE(v_matricula, '?'),
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
      COALESCE(v_matricula, '?'),
      v_descricao,
      NEW.data_fim, NEW.data_fim, false,
      v_matricula, COALESCE(NEW.created_by, auth.uid())
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_open() IS
  'Cascata ao criar contrato_renting: avança reserva, ocupa viatura, gera eventos no calendário. titulo = matrícula normalizada; descrição usa observacoes_internas quando preenchido.';

-- Backfill: repor titulo = matrícula limpa nos eventos já gerados com
-- título composto ('Entrega — ...' / 'Recolha — ...'). A matrícula limpa
-- está em matricula_devolver. Idempotente — após correr, o título deixa de
-- conter ' — ' e a condição não volta a aplicar-se.
UPDATE public.calendario_eventos
   SET titulo = matricula_devolver
 WHERE tipo IN ('entrega', 'recolha')
   AND matricula_devolver IS NOT NULL
   AND titulo LIKE '% — %';
