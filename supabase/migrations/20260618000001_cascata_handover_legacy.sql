-- Refactor: Cascata de eventos para contratos legacy (como renting)
--
-- Objetivo: trigger cria AMBOS os eventos (entrega + recolha) ao inserir contrato.
-- Código TS só verifica se existem (safety net defensivo).
--
-- Isto torna o modelo consistente com contratos_renting:
--   - evento é sempre criado por trigger (não por código TS)
--   - código TS é consumidor, não produtor
--   - sem fallbacks confusos nos drawers

CREATE OR REPLACE FUNCTION public.ensure_contratos_cascata_handover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Apenas contratos ativos com data_inicio válida
  IF NEW.status = 'ativo' AND NEW.data_inicio IS NOT NULL THEN
    -- 1. Cria evento 'entrega' (com data_inicio)
    INSERT INTO public.calendario_eventos (
      org_id,
      tipo,
      titulo,
      data_inicio,
      dia_todo,
      criado_por,
      origen_tipo,
      origen_id
    ) VALUES (
      NEW.org_id,
      'entrega',
      'Entrega de viatura',
      NEW.data_inicio,
      false,
      NEW.criado_por,
      'contrato',
      NEW.id
    )
    ON CONFLICT DO NOTHING;  -- idempotente

    -- 2. Cria evento 'recolha' (data_inicio=NULL, será preenchido on-demand)
    INSERT INTO public.calendario_eventos (
      org_id,
      tipo,
      titulo,
      data_inicio,
      dia_todo,
      criado_por,
      origen_tipo,
      origen_id
    ) VALUES (
      NEW.org_id,
      'recolha',
      'Devolução de viatura',
      NULL,  -- on-demand, só preenchido quando recolha inicia
      false,
      NEW.criado_por,
      'contrato',
      NEW.id
    )
    ON CONFLICT DO NOTHING;  -- idempotente
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contratos_cascata_handover ON public.contratos;
CREATE TRIGGER trg_contratos_cascata_handover
  AFTER INSERT ON public.contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_contratos_cascata_handover();
