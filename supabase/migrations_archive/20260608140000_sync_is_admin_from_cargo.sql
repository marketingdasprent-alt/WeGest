-- ============================================================
-- Sincroniza profiles.is_admin a partir do cargo, automaticamente.
-- ============================================================
-- Problema: promover alguém a admin pelo ecrã "editar utilizador" mudava o
-- cargo mas NÃO ligava a flag is_admin (a correção do frontend nunca foi
-- publicada). Resultado: cargo "Administrador" mas is_admin = false.
--
-- Solução: trigger na BD que define is_admin = (nome do cargo contém 'admin')
-- sempre que o cargo do utilizador muda. Funciona para QUALQUER caminho
-- (UsersTab, edge function create-user, SQL manual), sem depender de deploy.
--
-- Idempotente e aditiva.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_is_admin_from_cargo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cargo_nome text;
BEGIN
  -- Nome do cargo: preferir o ligado por cargo_id; senão, o texto em profiles.cargo
  IF NEW.cargo_id IS NOT NULL THEN
    SELECT nome INTO _cargo_nome FROM public.cargos WHERE id = NEW.cargo_id;
  END IF;
  _cargo_nome := COALESCE(_cargo_nome, NEW.cargo, '');

  NEW.is_admin := (_cargo_nome ILIKE '%admin%');
  RETURN NEW;
END;
$$;

-- Só dispara quando o cargo muda (não mexe noutras edições do perfil,
-- nem no INSERT/bootstrap do primeiro utilizador).
DROP TRIGGER IF EXISTS trg_sync_is_admin ON public.profiles;
CREATE TRIGGER trg_sync_is_admin
  BEFORE UPDATE OF cargo_id, cargo ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_is_admin_from_cargo();
