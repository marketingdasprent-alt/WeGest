-- ============================================================
-- Preencher cidade (estação) nos eventos de entrega/recolha
-- ============================================================
-- Bug: calendario_eventos.cidade nunca era preenchida pela cascata do
-- contrato_renting, apesar da coluna existir e o dialog/card já a
-- mostrarem quando presente. contratos_renting tem estacao_entrega_id
-- e estacao_recolha_id (FK -> estacoes) que ficavam por usar.
--
-- Correção: contrato_renting_cascata_open e contrato_renting_cascata_data_fim
-- passam a fazer lookup de estacoes.cidade (fallback a estacoes.nome quando
-- cidade não estiver preenchida na estação) e a gravar em calendario_eventos.cidade.
--   - Evento de entrega  -> estacao_entrega_id
--   - Evento de recolha  -> estacao_recolha_id
--
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS. Backfill só
-- toca eventos com cidade IS NULL, origem_tipo='contrato_renting' e
-- tipo IN ('entrega','recolha'), portanto corre a 0 linhas em reexecuções.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula      text;
  v_cliente_nome   text;
  v_descricao      text;
  v_cidade_entrega text;
  v_cidade_recolha text;
BEGIN
  -- Snapshot de dados úteis para o evento de calendário
  IF NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
    v_matricula := UPPER(REGEXP_REPLACE(v_matricula, '[\s-]', '', 'g'));
  END IF;
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = NEW.cliente_id;
  END IF;
  IF NEW.estacao_entrega_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(cidade), ''), nome) INTO v_cidade_entrega
      FROM public.estacoes WHERE id = NEW.estacao_entrega_id;
  END IF;
  IF NEW.estacao_recolha_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(cidade), ''), nome) INTO v_cidade_recolha
      FROM public.estacoes WHERE id = NEW.estacao_recolha_id;
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
    tipo, titulo, descricao, cidade,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, criado_por,
    origem_tipo, origem_id
  )
  VALUES (
    'entrega',
    COALESCE(v_matricula, '?'),
    v_descricao, v_cidade_entrega,
    NEW.data_inicio, NEW.data_inicio, false,
    v_matricula, COALESCE(NEW.created_by, auth.uid()),
    'contrato_renting', NEW.id
  );

  -- 3. Evento de recolha (só para contratos não-TVDE).
  --    Em TVDE a recolha/devolução é decidida no fecho do contrato:
  --    o gestor escolhe o tipo (recolha ou devolução) e a data nesse momento.
  IF NEW.data_fim IS NOT NULL AND NEW.regime <> 'tvde' THEN
    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao, cidade,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por,
      origem_tipo, origem_id
    )
    VALUES (
      'recolha',
      COALESCE(v_matricula, '?'),
      v_descricao, v_cidade_recolha,
      NEW.data_fim, NEW.data_fim, false,
      v_matricula, COALESCE(NEW.created_by, auth.uid()),
      'contrato_renting', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_open() IS
  'Cascata ao criar contrato_renting: avança reserva, ocupa viatura, gera eventos no calendário com cidade da estação de entrega/recolha. '
  'TVDE não gera evento de recolha automático — a recolha/devolução é criada no fecho do contrato.';

-- ------------------------------------------------------------
-- contrato_renting_cascata_data_fim: mesmo lookup ao mover/criar
-- o evento de recolha quando data_fim muda.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_data_fim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula      text;
  v_descricao      text;
  v_cidade_recolha text;
  v_updated_rows   integer;
BEGIN
  -- Nenhuma alteração efectiva a data_fim → sair
  IF NEW.data_fim IS NOT DISTINCT FROM OLD.data_fim THEN
    RETURN NEW;
  END IF;

  -- TVDE: recolha/devolução gerida no fecho manual do contrato
  IF NEW.regime = 'tvde' THEN
    RETURN NEW;
  END IF;

  -- Contrato já fechado: não tocar em eventos (já foram limpos)
  IF NEW.estado_operacional IN ('cancelado', 'devolvido') THEN
    RETURN NEW;
  END IF;

  -- data_fim removida → apagar evento de recolha
  IF NEW.data_fim IS NULL THEN
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id   = NEW.id
       AND tipo        = 'recolha';
    RETURN NEW;
  END IF;

  IF NEW.estacao_recolha_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(cidade), ''), nome) INTO v_cidade_recolha
      FROM public.estacoes WHERE id = NEW.estacao_recolha_id;
  END IF;

  -- Mover evento de recolha existente para a nova data
  UPDATE public.calendario_eventos
     SET data_inicio = NEW.data_fim,
         data_fim    = NEW.data_fim,
         cidade      = v_cidade_recolha
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = NEW.id
     AND tipo        = 'recolha';

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  -- Evento não existia (ex.: contrato criado sem data_fim) → criar agora
  IF v_updated_rows = 0 THEN
    IF NEW.viatura_id IS NOT NULL THEN
      SELECT UPPER(REGEXP_REPLACE(matricula, '[\s-]', '', 'g'))
        INTO v_matricula
        FROM public.viaturas
       WHERE id = NEW.viatura_id;
    END IF;

    v_descricao := COALESCE(
      NULLIF(TRIM(NEW.observacoes_internas), ''),
      'Gerado automaticamente pelo contrato #' || NEW.codigo
    );

    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao, cidade,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por,
      origem_tipo, origem_id
    )
    VALUES (
      'recolha',
      COALESCE(v_matricula, '?'),
      v_descricao, v_cidade_recolha,
      NEW.data_fim, NEW.data_fim, false,
      v_matricula, COALESCE(auth.uid(), NEW.created_by),
      'contrato_renting', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_data_fim() IS
  'Sincroniza o evento de recolha no calendário quando data_fim muda num contrato rent-a-car ou slot, incluindo a cidade da estação de recolha. '
  'Move evento existente, cria se não existia, apaga se data_fim passou a NULL. '
  'Ignora contratos TVDE (recolha gerida no fecho) e contratos já fechados.';

-- ------------------------------------------------------------
-- Trigger para sincronizar cidade também quando a estação muda
-- sem mudar a data_fim (ex.: gestor corrige a estação de entrega
-- ou recolha depois de criar o contrato).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_estacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cidade_entrega text;
  v_cidade_recolha text;
BEGIN
  IF NEW.estacao_entrega_id IS NOT DISTINCT FROM OLD.estacao_entrega_id
     AND NEW.estacao_recolha_id IS NOT DISTINCT FROM OLD.estacao_recolha_id THEN
    RETURN NEW;
  END IF;

  IF NEW.estacao_entrega_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(cidade), ''), nome) INTO v_cidade_entrega
      FROM public.estacoes WHERE id = NEW.estacao_entrega_id;
  END IF;
  IF NEW.estacao_recolha_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(cidade), ''), nome) INTO v_cidade_recolha
      FROM public.estacoes WHERE id = NEW.estacao_recolha_id;
  END IF;

  UPDATE public.calendario_eventos
     SET cidade = v_cidade_entrega
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = NEW.id
     AND tipo        = 'entrega';

  UPDATE public.calendario_eventos
     SET cidade = v_cidade_recolha
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = NEW.id
     AND tipo        = 'recolha';

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_estacao() IS
  'Sincroniza calendario_eventos.cidade quando estacao_entrega_id/estacao_recolha_id mudam num contrato_renting, sem depender de mudança de data.';

DROP TRIGGER IF EXISTS trg_contrato_renting_cascata_estacao ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_cascata_estacao
  AFTER UPDATE OF estacao_entrega_id, estacao_recolha_id ON public.contratos_renting
  FOR EACH ROW
  EXECUTE FUNCTION public.contrato_renting_cascata_estacao();

-- ------------------------------------------------------------
-- Backfill: preencher cidade nos eventos já existentes que ainda
-- não a têm.
-- ------------------------------------------------------------
UPDATE public.calendario_eventos ce
   SET cidade = est.cidade_resolvida
  FROM (
    SELECT
      c.id,
      COALESCE(NULLIF(TRIM(e.cidade), ''), e.nome) AS cidade_resolvida
    FROM public.contratos_renting c
    JOIN public.estacoes e ON e.id = c.estacao_entrega_id
  ) est
 WHERE ce.origem_tipo = 'contrato_renting'
   AND ce.origem_id   = est.id
   AND ce.tipo        = 'entrega'
   AND ce.cidade IS NULL;

UPDATE public.calendario_eventos ce
   SET cidade = est.cidade_resolvida
  FROM (
    SELECT
      c.id,
      COALESCE(NULLIF(TRIM(e.cidade), ''), e.nome) AS cidade_resolvida
    FROM public.contratos_renting c
    JOIN public.estacoes e ON e.id = c.estacao_recolha_id
  ) est
 WHERE ce.origem_tipo = 'contrato_renting'
   AND ce.origem_id   = est.id
   AND ce.tipo        = 'recolha'
   AND ce.cidade IS NULL;
