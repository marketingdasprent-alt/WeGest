-- ============================================================
-- Sincronizar a descrição do evento quando observacoes_internas muda
-- ------------------------------------------------------------
-- Bug: ao CRIAR um contrato, observacoes_internas vai para a descrição
-- dos eventos de entrega/recolha (contrato_renting_cascata_open). Mas ao
-- EDITAR observacoes_internas depois, os eventos não eram atualizados —
-- não existia trigger AFTER UPDATE OF observacoes_internas.
--
-- Correção: gémeo do contrato_renting_cascata_data_fim, mas a reagir a
-- observacoes_internas. Atualiza a descrição dos eventos do contrato
-- (origem_tipo='contrato_renting' + origem_id) de entrega e recolha.
-- Espelha a regra do open: observacoes_internas se preenchido, senão o
-- texto automático.
--
-- Só faz UPDATE de eventos existentes (não cria nem ressuscita): em
-- contratos fechados, cujos eventos já foram limpos, casa 0 linhas.
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_observacoes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_descricao text;
BEGIN
  -- Nenhuma alteração efectiva → sair (evita escritas redundantes)
  IF NEW.observacoes_internas IS NOT DISTINCT FROM OLD.observacoes_internas THEN
    RETURN NEW;
  END IF;

  -- Mesma regra do cascata_open: observação interna ou texto automático
  v_descricao := COALESCE(
    NULLIF(TRIM(NEW.observacoes_internas), ''),
    'Gerado automaticamente pelo contrato #' || NEW.codigo
  );

  UPDATE public.calendario_eventos
     SET descricao = v_descricao
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = NEW.id
     AND tipo IN ('entrega', 'recolha');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_observacoes() IS
  'Sincroniza a descrição dos eventos (entrega/recolha) no calendário quando observacoes_internas muda num contrato_renting. Espelha a regra do cascata_open. Só atualiza eventos existentes.';

DROP TRIGGER IF EXISTS trg_contrato_renting_cascata_observacoes ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_cascata_observacoes
  AFTER UPDATE OF observacoes_internas ON public.contratos_renting
  FOR EACH ROW
  EXECUTE FUNCTION public.contrato_renting_cascata_observacoes();

-- ------------------------------------------------------------
-- Backfill: re-alinhar eventos já existentes com a observação atual
-- do contrato (corrige os que ficaram desatualizados antes deste fix).
-- Conservador: só toca onde a descrição diverge; eventos são derivados
-- do sistema, por isso não há edições manuais a preservar.
-- Idempotente: depois de correr, tudo casa → 0 linhas.
-- ------------------------------------------------------------
UPDATE public.calendario_eventos ce
   SET descricao = COALESCE(
         NULLIF(TRIM(c.observacoes_internas), ''),
         'Gerado automaticamente pelo contrato #' || c.codigo
       )
  FROM public.contratos_renting c
 WHERE ce.origem_tipo = 'contrato_renting'
   AND ce.origem_id   = c.id
   AND ce.tipo        IN ('entrega', 'recolha')
   AND c.deleted_at IS NULL
   AND ce.descricao IS DISTINCT FROM COALESCE(
         NULLIF(TRIM(c.observacoes_internas), ''),
         'Gerado automaticamente pelo contrato #' || c.codigo
       );
