-- ============================================================
-- Separar o ciclo do CONTRATO do da VIATURA (parte 2/3: comportamento)
-- ============================================================
-- Ver 20260820150000 para o porquê. Aqui ensina-se às cascatas o estado
-- 'fechado' e corrige-se a assimetria que fazia perder histórico:
--
--   fechado   → liberta a viatura E PRESERVA os eventos (aconteceu mesmo)
--   cancelado → liberta a viatura e apaga os eventos (não chegou a acontecer)
--
-- Até aqui só existia o segundo comportamento para quem carregava em
-- "Fechar contrato", e por isso fechar um contrato apagava-lhe o histórico
-- de calendário.
--
-- 'devolvido' continua aceite em todos os guards durante a transição — a
-- migração de dados (20260820150200) esvazia-o, mas o valor permanece no
-- enum e não custa nada tolerá-lo.
-- ============================================================

-- ------------------------------------------------------------
-- 1) cascata_estado
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_novo_estado_reserva text;
BEGIN
  IF NEW.estado_operacional IS NOT DISTINCT FROM OLD.estado_operacional THEN
    RETURN NEW;
  END IF;

  IF NEW.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reserva_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.estado_operacional = 'cancelado' THEN
    -- Não chegou a acontecer: reserva cai e a viatura volta à frota.
    v_novo_estado_reserva := 'cancelada';
  ELSIF NEW.estado_operacional IN ('fechado', 'devolvido') THEN
    -- Correu e terminou: o ciclo da reserva cumpriu-se.
    v_novo_estado_reserva := 'concluida';
  ELSE
    -- agendado→em_curso não exige cascata: a reserva já está em_curso.
    RETURN NEW;
  END IF;

  UPDATE public.reservas
     SET estado = v_novo_estado_reserva::reserva_estado_enum
   WHERE id = NEW.reserva_id;

  -- Só o cancelamento apaga eventos, e mesmo assim SÓ os que estavam por
  -- realizar — compromissos que deixaram de fazer sentido. Um evento com
  -- realizado_em preenchido é um facto: a viatura saiu mesmo, alguém a
  -- entregou mesmo. Cancelar não desfaz o passado.
  --
  -- Isto passou a importar quando cancelar deixou de estar limitado a
  -- contratos por entregar: um DELETE cego apagaria a entrega confirmada de
  -- um contrato com a viatura na rua, que é precisamente o histórico que
  -- alimenta o Relatório de Eventos.
  IF NEW.estado_operacional = 'cancelado' THEN
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo   = 'contrato_renting'
       AND origem_id     = NEW.id
       AND realizado_em IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.contrato_renting_cascata_estado() IS
  'Cascata contrato->reserva. fechado/devolvido -> reserva concluida, eventos '
  'preservados. cancelado -> reserva cancelada, eventos apagados. Versoes '
  'substituidas (substituido_em) nao cascateiam.';

-- ------------------------------------------------------------
-- 2) cascata_realizacao — em_curso→fechado marca a recolha realizada
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_realizacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_evento_tipo text;
  v_actor       uuid;
BEGIN
  IF NEW.estado_operacional IS NOT DISTINCT FROM OLD.estado_operacional THEN
    RETURN NEW;
  END IF;

  IF NEW.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_evento_tipo := CASE
    WHEN OLD.estado_operacional = 'agendado' AND NEW.estado_operacional = 'em_curso' THEN 'entrega'
    WHEN OLD.estado_operacional = 'em_curso' AND NEW.estado_operacional IN ('fechado', 'devolvido') THEN 'recolha'
    ELSE NULL
  END;

  IF v_evento_tipo IS NULL THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(NEW.updated_by, auth.uid());

  UPDATE public.calendario_eventos
     SET realizado_por_id = v_actor,
         realizado_em     = now()
   WHERE origem_tipo      = 'contrato_renting'
     AND origem_id        = NEW.id
     AND tipo             = v_evento_tipo
     AND realizado_em     IS NULL;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- 3) cascata_data_fim — contrato terminado não regenera recolha
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_data_fim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_matricula      text;
  v_descricao      text;
  v_cidade_recolha text;
  v_updated_rows   integer;
BEGIN
  IF NEW.data_fim IS NOT DISTINCT FROM OLD.data_fim THEN
    RETURN NEW;
  END IF;

  IF NEW.regime = 'tvde' THEN
    RETURN NEW;
  END IF;

  IF NEW.estado_operacional IN ('cancelado', 'devolvido', 'fechado') THEN
    RETURN NEW;
  END IF;

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

  UPDATE public.calendario_eventos
     SET data_inicio = NEW.data_fim,
         data_fim    = NEW.data_fim,
         cidade      = v_cidade_recolha
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = NEW.id
     AND tipo        = 'recolha';

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

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
$function$;

-- ------------------------------------------------------------
-- 4) inativar_motorista_na_devolucao — fechar também encerra o condutor
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_renting_inativar_motorista_na_devolucao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado_operacional IS NOT DISTINCT FROM OLD.estado_operacional THEN
    RETURN NEW;
  END IF;

  IF NEW.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.estado_operacional NOT IN ('cancelado', 'devolvido', 'fechado') THEN
    RETURN NEW;
  END IF;

  UPDATE public.motoristas_ativos
     SET status_ativo = false
   WHERE id IN (
     SELECT motorista_id
       FROM public.contrato_condutores
      WHERE contrato_id = NEW.id
        AND motorista_id IS NOT NULL
   );

  RETURN NEW;
END;
$function$;
