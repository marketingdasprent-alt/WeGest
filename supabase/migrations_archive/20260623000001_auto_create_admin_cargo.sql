-- ============================================================
-- Trigger: auto-criar cargo "Administrador" para nova org
-- ============================================================
-- Quando uma organização é criada, criar automaticamente um cargo
-- "Administrador" com todas as permissões para essa org.
-- Isto garante que a primeira pessoa a entrar tem grupo + perms.
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_create_admin_cargo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cargo_id UUID;
BEGIN
  -- Criar cargo "Administrador" para esta org
  INSERT INTO public.cargos (nome, org_id)
  VALUES ('Administrador', NEW.id)
  RETURNING id INTO _cargo_id;

  -- Atribuir TODAS as permissões (pode_ver, pode_criar, pode_editar, pode_deletar)
  -- para todos os recursos existentes
  INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, pode_ver, pode_criar, pode_editar, pode_deletar)
  SELECT _cargo_id, id, true, true, true, true
  FROM public.recursos
  ON CONFLICT (cargo_id, recurso_id) DO UPDATE
  SET pode_ver = true, pode_criar = true, pode_editar = true, pode_deletar = true;

  RETURN NEW;
END;
$$;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trigger_auto_create_admin_cargo ON public.organizacoes;

-- Criar trigger
CREATE TRIGGER trigger_auto_create_admin_cargo
AFTER INSERT ON public.organizacoes
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_admin_cargo();
