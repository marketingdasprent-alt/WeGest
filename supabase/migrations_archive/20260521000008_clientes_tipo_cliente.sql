-- ============================================================
-- Classificação de cliente: particular | empresa | condutor
-- ============================================================
-- Até agora os clientes só distinguiam pessoa vs empresa via o
-- boolean `is_empresa`. Adicionamos `tipo_cliente` para suportar
-- também "condutor" (alguém que conduz mas não é o titular/pagador).
--
-- `is_empresa` é mantido em sincronia por trigger (bidireccional)
-- para não partir código legacy que ainda lê/escreve essa coluna.
-- Source-of-truth passa a ser `tipo_cliente`.
-- ============================================================

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tipo_cliente text NOT NULL DEFAULT 'particular'
    CHECK (tipo_cliente IN ('particular', 'empresa', 'condutor'));

-- Backfill a partir do boolean existente
UPDATE public.clientes
   SET tipo_cliente = 'empresa'
 WHERE is_empresa = true
   AND tipo_cliente <> 'empresa';

CREATE INDEX IF NOT EXISTS idx_clientes_tipo_cliente
  ON public.clientes (tipo_cliente);

-- ────────────────────────────────────────────────────────────
-- Sincronização bidireccional tipo_cliente ↔ is_empresa
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_clientes_sync_tipo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Se vier is_empresa=true mas tipo ficou no default, ajusta o tipo.
    IF NEW.tipo_cliente = 'particular' AND NEW.is_empresa = true THEN
      NEW.tipo_cliente := 'empresa';
    END IF;
    NEW.is_empresa := (NEW.tipo_cliente = 'empresa');
  ELSE
    -- Update: o lado que mudou manda no outro.
    IF NEW.tipo_cliente IS DISTINCT FROM OLD.tipo_cliente THEN
      NEW.is_empresa := (NEW.tipo_cliente = 'empresa');
    ELSIF NEW.is_empresa IS DISTINCT FROM OLD.is_empresa THEN
      NEW.tipo_cliente := CASE WHEN NEW.is_empresa THEN 'empresa' ELSE 'particular' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_sync_tipo ON public.clientes;
CREATE TRIGGER trg_clientes_sync_tipo
  BEFORE INSERT OR UPDATE OF tipo_cliente, is_empresa ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_clientes_sync_tipo();

COMMENT ON COLUMN public.clientes.tipo_cliente IS
  'Classificação: particular (pessoa pagadora) | empresa | condutor '
  '(conduz mas não é titular). Mantém is_empresa em sincronia por trigger.';
