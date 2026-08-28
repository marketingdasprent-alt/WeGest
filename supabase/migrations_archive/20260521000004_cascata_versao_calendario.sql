-- ============================================================
-- Cascata versionamento → calendário
-- ============================================================
-- Quando uma nova versão de contrato é criada com viatura
-- diferente, o calendário tem de reflectir a operação física:
--   • a versão substituída (v1) sai do calendário (apagar
--     eventos pendentes — a entrega já aconteceu, a recolha
--     original deixa de valer)
--   • a versão actual (v2) ganha:
--       - um evento 'troca' (ou 'upgrade' se o grupo mudou)
--         na data NOW() representando o swap físico
--       - uma nova recolha com a viatura nova na data_fim
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_versao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula_nova    text;
  v_cidade_entrega    text;
  v_cidade_recolha    text;
  v_tipo_evento       text;
BEGIN
  -- ──────────────────────────────────────────────────────────
  -- Caso 1: contrato substituído → apagar eventos pendentes
  -- ──────────────────────────────────────────────────────────
  IF OLD.substituido_em IS NULL AND NEW.substituido_em IS NOT NULL THEN
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id   = NEW.id
       AND tipo IN ('entrega', 'recolha');
    RETURN NEW;
  END IF;

  -- ──────────────────────────────────────────────────────────
  -- Caso 2: viatura mudou numa versão > 1 → troca/upgrade
  -- ──────────────────────────────────────────────────────────
  IF NEW.contrato_anterior_id IS NOT NULL
     AND NEW.substituido_em IS NULL
     AND OLD.viatura_id IS DISTINCT FROM NEW.viatura_id
  THEN
    -- Matricula nova (do viatura_id actual)
    SELECT matricula INTO v_matricula_nova
      FROM public.viaturas WHERE id = NEW.viatura_id;

    -- Cidade da estação de entrega/recolha
    IF NEW.estacao_entrega_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(trim(cidade), ''), nome)
        INTO v_cidade_entrega
        FROM public.estacoes WHERE id = NEW.estacao_entrega_id;
    END IF;
    IF NEW.estacao_recolha_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(trim(cidade), ''), nome)
        INTO v_cidade_recolha
        FROM public.estacoes WHERE id = NEW.estacao_recolha_id;
    END IF;

    -- Tipo: 'upgrade' se o grupo também mudou, senão 'troca'
    v_tipo_evento := CASE
      WHEN OLD.grupo IS DISTINCT FROM NEW.grupo THEN 'upgrade'
      ELSE 'troca'
    END;

    -- 1) Apagar eventos entrega/recolha desta versão (criados pelo
    --    cascata_open com a viatura antiga ao clonar)
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id   = NEW.id
       AND tipo IN ('entrega', 'recolha');

    -- 2) Inserir evento 'troca' ou 'upgrade' no momento do swap
    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao, cidade,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por,
      origem_tipo, origem_id
    )
    VALUES (
      v_tipo_evento,
      v_matricula_nova,
      'Gerado automaticamente — '
        || v_tipo_evento || ' no contrato #' || NEW.codigo,
      v_cidade_entrega,
      now(), now(), false,
      OLD.matricula, COALESCE(NEW.updated_by, auth.uid()),
      'contrato_renting', NEW.id
    );

    -- 3) Recriar recolha com a viatura nova (se data_fim definida)
    IF NEW.data_fim IS NOT NULL THEN
      INSERT INTO public.calendario_eventos (
        tipo, titulo, descricao, cidade,
        data_inicio, data_fim, dia_todo,
        matricula_devolver, criado_por,
        origem_tipo, origem_id
      )
      VALUES (
        'recolha',
        v_matricula_nova,
        'Gerado automaticamente pelo contrato #' || NEW.codigo,
        v_cidade_recolha,
        NEW.data_fim, NEW.data_fim, false,
        v_matricula_nova, COALESCE(NEW.updated_by, auth.uid()),
        'contrato_renting', NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: AFTER UPDATE porque precisamos dos novos valores para
-- as queries; SECURITY DEFINER já no nível da função.
DROP TRIGGER IF EXISTS trg_contrato_renting_cascata_versao ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_cascata_versao
AFTER UPDATE ON public.contratos_renting
FOR EACH ROW EXECUTE FUNCTION public.contrato_renting_cascata_versao();

COMMENT ON FUNCTION public.contrato_renting_cascata_versao() IS
  'Cascateia o versionamento de contratos para o calendário: '
  'apaga eventos da versão substituída e cria troca/upgrade + '
  'recolha actualizada na versão actual quando a viatura muda.';
