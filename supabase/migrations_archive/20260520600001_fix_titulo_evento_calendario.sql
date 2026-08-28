-- ============================================================
-- Fix título dos eventos de calendário gerados pela cascata
-- ============================================================
-- Bug original: contrato_renting_cascata_open() construía o título
-- como "Entrega — BX-99-LM (NOME_DO_CLIENTE)" — mistura matrícula
-- com nome de cliente, e ainda fazia split do nome em prefixos
-- estranhos que apareciam truncados no UI.
--
-- Formato canónico passa a ser:
--   • com estação: "{matricula} {NOME_ESTACAO}"
--   • sem estação (TVDE longa duração): "{matricula}"
--   • sem matrícula (defensivo): "Contrato #{codigo}"
--
-- Recolha mostra estação de recolha; entrega mostra estação de entrega.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula text;
  v_estacao_entrega text;
  v_estacao_recolha text;
  v_titulo_entrega text;
  v_titulo_recolha text;
BEGIN
  IF NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
  END IF;
  IF NEW.estacao_entrega_id IS NOT NULL THEN
    SELECT upper(nome) INTO v_estacao_entrega
      FROM public.estacoes WHERE id = NEW.estacao_entrega_id;
  END IF;
  IF NEW.estacao_recolha_id IS NOT NULL THEN
    SELECT upper(nome) INTO v_estacao_recolha
      FROM public.estacoes WHERE id = NEW.estacao_recolha_id;
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

  -- Construir títulos
  v_titulo_entrega := CASE
    WHEN v_matricula IS NULL THEN 'Contrato #' || NEW.codigo
    WHEN v_estacao_entrega IS NULL THEN v_matricula
    ELSE v_matricula || ' ' || v_estacao_entrega
  END;
  v_titulo_recolha := CASE
    WHEN v_matricula IS NULL THEN 'Contrato #' || NEW.codigo
    WHEN v_estacao_recolha IS NULL THEN v_matricula
    ELSE v_matricula || ' ' || v_estacao_recolha
  END;

  -- Evento de entrega
  INSERT INTO public.calendario_eventos (
    tipo, titulo, descricao,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, criado_por,
    origem_tipo, origem_id
  )
  VALUES (
    'entrega',
    v_titulo_entrega,
    'Gerado automaticamente pelo contrato #' || NEW.codigo,
    NEW.data_inicio, NEW.data_inicio, false,
    v_matricula, COALESCE(NEW.created_by, auth.uid()),
    'contrato_renting', NEW.id
  );

  -- Evento de recolha (só se data_fim definida)
  IF NEW.data_fim IS NOT NULL THEN
    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por,
      origem_tipo, origem_id
    )
    VALUES (
      'recolha',
      v_titulo_recolha,
      'Gerado automaticamente pelo contrato #' || NEW.codigo,
      NEW.data_fim, NEW.data_fim, false,
      v_matricula, COALESCE(NEW.created_by, auth.uid()),
      'contrato_renting', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;
