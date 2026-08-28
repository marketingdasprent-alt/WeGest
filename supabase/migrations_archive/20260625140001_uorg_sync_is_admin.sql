-- supabase/migrations/20260625140001_uorg_sync_is_admin.sql
-- Espelho de sync_is_admin_from_cargo, mas no membership (per-org).

CREATE OR REPLACE FUNCTION public.sync_uorg_is_admin_from_cargo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cargo_nome text;
BEGIN
  IF NEW.cargo_id IS NOT NULL THEN
    SELECT nome INTO _cargo_nome FROM public.cargos WHERE id = NEW.cargo_id;
  END IF;
  NEW.is_admin := (COALESCE(_cargo_nome, '') ILIKE '%admin%');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uorg_sync_is_admin ON public.user_organizacoes;
CREATE TRIGGER trg_uorg_sync_is_admin
  BEFORE UPDATE OF cargo_id ON public.user_organizacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_uorg_is_admin_from_cargo();
