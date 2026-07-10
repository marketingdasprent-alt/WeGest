-- ============================================================
-- is_slot derivado do tipo de viatura "SLOT"
-- ============================================================
-- Problema: as pessoas marcam o TIPO da viatura como "SLOT" mas esquecem-se
-- de ligar o switch separado `is_slot` — e a viatura deixa de se comportar
-- como slot (não aparece nas reservas slot, etc.). Agravado por o toggle
-- estar escondido no formulário atrás de `elegivel_tvde`.
--
-- Solução (unidirecional, não-destrutiva): sempre que o tipo da viatura for
-- "SLOT", `is_slot` fica true automaticamente. NUNCA se força false — assim
-- as viaturas slot antigas sem tipo (is_slot=true, tipo≠SLOT) continuam a
-- funcionar tal como estão. Zero alteração aos consumidores de `is_slot`.
-- ============================================================

-- Trigger: tipo "SLOT" ⇒ is_slot = true (só liga, nunca desliga).
CREATE OR REPLACE FUNCTION public.fn_viatura_is_slot_do_tipo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.viatura_tipos t
    WHERE t.id = NEW.tipo_id
      AND upper(btrim(t.nome)) = 'SLOT'
  ) THEN
    NEW.is_slot := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_viatura_is_slot_do_tipo ON public.viaturas;
CREATE TRIGGER trg_viatura_is_slot_do_tipo
  BEFORE INSERT OR UPDATE OF tipo_id, is_slot ON public.viaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_viatura_is_slot_do_tipo();

-- Backfill: corrige as viaturas já com tipo SLOT mas is_slot=false (o bug
-- reportado). Aditivo — não mexe em mais nada.
UPDATE public.viaturas v
SET is_slot = true
FROM public.viatura_tipos t
WHERE v.tipo_id = t.id
  AND upper(btrim(t.nome)) = 'SLOT'
  AND v.is_slot IS DISTINCT FROM true;
