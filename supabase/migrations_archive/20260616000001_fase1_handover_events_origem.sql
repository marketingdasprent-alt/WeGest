-- Fase 1 (migração handover events): religar o evento 'entrega' ao contrato.
--
-- Objetivo: permitir que a leitura das listas de check-out/check-in seja
-- unificada (legacy + renting) via origem_tipo/origem_id, SEM duplicar eventos
-- e SEM alterar o comportamento atual.
--
-- Contexto: no fluxo legacy, o evento 'entrega' é criado no código TS ANTES de
-- o contrato existir, e ligado de volta via contratos.calendario_evento_id.
-- Este trigger corre AFTER INSERT em contratos e carimba o evento com
-- origem_tipo='contrato' + origem_id = contrato.id, agora que o id existe.
--
-- Aditivo e idempotente:
--   * CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.
--   * Só carimba eventos com origem_tipo IS NULL (não toca em 'contrato_renting'
--     nem em eventos já carimbados).
--   * Nenhuma coluna nova → types.ts NÃO precisa de alteração (origem_tipo e
--     origem_id já existem em calendario_eventos).

CREATE OR REPLACE FUNCTION public.ensure_contrato_handover_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Apenas contratos ativos cujo evento de entrega já foi criado pelo app.
  IF NEW.status = 'ativo' AND NEW.calendario_evento_id IS NOT NULL THEN
    UPDATE public.calendario_eventos
    SET origem_tipo = 'contrato',
        origem_id   = NEW.id
    WHERE id = NEW.calendario_evento_id
      AND origem_tipo IS NULL;   -- não sobrescreve renting/outros
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ensure_contrato_handover_events ON public.contratos;
CREATE TRIGGER trg_ensure_contrato_handover_events
  AFTER INSERT ON public.contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_contrato_handover_events();
