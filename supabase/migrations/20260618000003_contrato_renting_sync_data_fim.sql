-- ============================================================
-- Sincronizar evento de recolha ao alterar data_fim
-- ============================================================
-- Quando o gestor prolonga ou encurta um contrato rent-a-car/slot,
-- o evento de recolha no calendário deve reflectir a nova data.
--
-- TVDE não tem evento de recolha automático (gerado no fecho do
-- contrato via FecharContratoTVDEDialog) — é ignorado aqui.
--
-- Casos tratados:
--   1. data_fim alterada (não nula) → mover evento de recolha existente
--   2. data_fim alterada e evento não existia → criar evento de recolha
--   3. data_fim removida (NULL) → apagar evento de recolha
--
-- Não age em contratos já fechados (cancelado/devolvido): os seus
-- eventos já foram limpos pelo trg_contrato_renting_cascata_estado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_data_fim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula    text;
  v_descricao    text;
  v_updated_rows integer;
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

  -- Mover evento de recolha existente para a nova data
  UPDATE public.calendario_eventos
     SET data_inicio = NEW.data_fim,
         data_fim    = NEW.data_fim
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
      v_matricula, COALESCE(auth.uid(), NEW.created_by),
      'contrato_renting', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_data_fim() IS
  'Sincroniza o evento de recolha no calendário quando data_fim muda num contrato rent-a-car ou slot. '
  'Move evento existente, cria se não existia, apaga se data_fim passou a NULL. '
  'Ignora contratos TVDE (recolha gerida no fecho) e contratos já fechados.';

DROP TRIGGER IF EXISTS trg_contrato_renting_cascata_data_fim ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_cascata_data_fim
  AFTER UPDATE OF data_fim ON public.contratos_renting
  FOR EACH ROW
  EXECUTE FUNCTION public.contrato_renting_cascata_data_fim();
