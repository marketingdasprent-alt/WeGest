-- supabase/migrations/20260625140002_role_dual_write.sql
-- Dual-write do papel entre profiles (legado) e user_organizacoes (per-org).
-- is_admin é sempre derivado do cargo nos dois lados; só sincronizamos cargo_id.

-- profiles -> membership da org-casa
CREATE OR REPLACE FUNCTION public.mirror_profile_role_to_uorg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_organizacoes uo
  SET cargo_id = NEW.cargo_id
  WHERE uo.user_id = NEW.id
    AND uo.org_id  = NEW.org_id
    AND uo.cargo_id IS DISTINCT FROM NEW.cargo_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_profile_role ON public.profiles;
CREATE TRIGGER trg_mirror_profile_role
  AFTER UPDATE OF cargo_id ON public.profiles
  FOR EACH ROW
  WHEN (OLD.cargo_id IS DISTINCT FROM NEW.cargo_id)
  EXECUTE FUNCTION public.mirror_profile_role_to_uorg();

-- membership -> profiles (apenas a org-casa)
CREATE OR REPLACE FUNCTION public.mirror_uorg_role_to_profile()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles p
  SET cargo_id = NEW.cargo_id,
      cargo    = (SELECT nome FROM public.cargos WHERE id = NEW.cargo_id)
  WHERE p.id     = NEW.user_id
    AND p.org_id = NEW.org_id
    AND p.cargo_id IS DISTINCT FROM NEW.cargo_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_uorg_role ON public.user_organizacoes;
CREATE TRIGGER trg_mirror_uorg_role
  AFTER UPDATE OF cargo_id ON public.user_organizacoes
  FOR EACH ROW
  WHEN (OLD.cargo_id IS DISTINCT FROM NEW.cargo_id)
  EXECUTE FUNCTION public.mirror_uorg_role_to_profile();
