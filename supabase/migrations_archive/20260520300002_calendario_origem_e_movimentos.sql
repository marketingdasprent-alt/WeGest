-- ============================================================
-- Fase 2c — Calendário como cache derivada
-- ============================================================
-- 1. Adiciona origem (tipo + id) aos eventos do calendário para audit
--    e dedup. Permite saber de onde veio cada evento.
-- 2. Recria contrato_renting_cascata_open para preencher origem.
-- 3. Trigger movimento_calendario_sync cria evento quando um
--    movimento é inserido (transferencia/manutencao/inspecao/impro).
-- ============================================================

-- ------------------------------------------------------------
-- 1. ALTER TABLE — colunas de origem
-- ------------------------------------------------------------
ALTER TABLE public.calendario_eventos
  ADD COLUMN IF NOT EXISTS origem_tipo text,
  ADD COLUMN IF NOT EXISTS origem_id uuid;

COMMENT ON COLUMN public.calendario_eventos.origem_tipo IS
  'Entidade que gerou o evento: contrato_renting | movimento | viatura | manual.';
COMMENT ON COLUMN public.calendario_eventos.origem_id IS
  'ID do registo na entidade de origem (FK lógica, não enforçada).';

CREATE INDEX IF NOT EXISTS idx_calendario_eventos_origem
  ON public.calendario_eventos (origem_tipo, origem_id);

-- ------------------------------------------------------------
-- 2. Recria cascata do contrato_renting com origem preenchida
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula text;
  v_cliente_nome text;
BEGIN
  IF NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
  END IF;
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = NEW.cliente_id;
  END IF;

  -- Reserva → em_curso
  IF NEW.reserva_id IS NOT NULL THEN
    UPDATE public.reservas
       SET estado = 'em_curso'
     WHERE id = NEW.reserva_id
       AND estado IN ('confirmada', 'pendente');
  END IF;

  -- (viaturas.status é tratado por trg_contratos_disponibilidade →
  --  recalcular_disponibilidade_viatura. Contratos 'agendado' →
  --  viatura 'reservada'; 'em_curso' → 'em_uso'.)

  -- Evento de entrega
  INSERT INTO public.calendario_eventos (
    tipo, titulo, descricao,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, criado_por,
    origem_tipo, origem_id
  )
  VALUES (
    'entrega',
    'Entrega — ' || COALESCE(v_matricula, '?') ||
      CASE WHEN v_cliente_nome IS NOT NULL THEN ' (' || v_cliente_nome || ')' ELSE '' END,
    'Gerado automaticamente pelo contrato #' || NEW.codigo,
    NEW.data_inicio, NEW.data_inicio, false,
    v_matricula, COALESCE(NEW.created_by, auth.uid()),
    'contrato_renting', NEW.id
  );

  -- Evento de recolha (se data_fim definida)
  IF NEW.data_fim IS NOT NULL THEN
    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por,
      origem_tipo, origem_id
    )
    VALUES (
      'recolha',
      'Recolha — ' || COALESCE(v_matricula, '?') ||
        CASE WHEN v_cliente_nome IS NOT NULL THEN ' (' || v_cliente_nome || ')' ELSE '' END,
      'Gerado automaticamente pelo contrato #' || NEW.codigo,
      NEW.data_fim, NEW.data_fim, false,
      v_matricula, COALESCE(NEW.created_by, auth.uid()),
      'contrato_renting', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 3. Trigger: movimento → evento de calendário
-- ------------------------------------------------------------
-- Cada movimento gera um evento do tipo correspondente. Idempotente:
-- se já existir evento para o movimento (mesma origem_id), não cria
-- outro. data_partida → data_inicio, data_chegada → data_fim.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.movimento_calendario_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula text;
  v_titulo text;
  v_tipo_evento text;
  v_data_inicio timestamptz;
  v_data_fim timestamptz;
BEGIN
  -- Movimentos sem viatura nem datas não geram evento
  IF NEW.viatura_id IS NULL AND NEW.matricula IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.data_partida IS NULL AND NEW.data_chegada IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotência — não duplicar evento para o mesmo movimento
  IF EXISTS (
    SELECT 1 FROM public.calendario_eventos
     WHERE origem_tipo = 'movimento' AND origem_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Matrícula: usa snapshot do movimento, fallback à viatura
  v_matricula := NEW.matricula;
  IF v_matricula IS NULL AND NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
  END IF;

  -- Tipo de evento — mapeia 1:1 do tipo do movimento
  v_tipo_evento := NEW.tipo;

  -- Datas — usa data_partida; data_chegada como fim se existir
  v_data_inicio := COALESCE(NEW.data_partida, NEW.data_chegada);
  v_data_fim := COALESCE(NEW.data_chegada, NEW.data_partida);

  -- Título descritivo por tipo
  v_titulo := CASE NEW.tipo
    WHEN 'transferencia' THEN 'Transferência — ' || COALESCE(v_matricula, '?')
    WHEN 'reparacao'     THEN 'Reparação — '     || COALESCE(v_matricula, '?')
    WHEN 'manutencao'    THEN 'Manutenção — '    || COALESCE(v_matricula, '?')
    WHEN 'inspecao'      THEN 'Inspeção — '      || COALESCE(v_matricula, '?')
    WHEN 'impro'         THEN 'Impro — '         || COALESCE(v_matricula, '?')
    ELSE NEW.tipo::text || ' — '                 || COALESCE(v_matricula, '?')
  END;

  INSERT INTO public.calendario_eventos (
    tipo, titulo, descricao,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, criado_por,
    origem_tipo, origem_id
  )
  VALUES (
    v_tipo_evento,
    v_titulo,
    'Gerado automaticamente pelo movimento #' || NEW.codigo,
    v_data_inicio, v_data_fim, false,
    v_matricula, COALESCE(NEW.created_by, auth.uid()),
    'movimento', NEW.id
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.movimento_calendario_sync() IS
  'Cria evento de calendário ao inserir movimento. Idempotente por (origem_tipo, origem_id).';

DROP TRIGGER IF EXISTS trg_movimento_calendario_sync ON public.movimentos;
CREATE TRIGGER trg_movimento_calendario_sync
  AFTER INSERT ON public.movimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.movimento_calendario_sync();
