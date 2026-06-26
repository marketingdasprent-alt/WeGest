-- Fix auto_create_admin_cargo: replace dead columns (pode_ver/pode_criar/pode_deletar)
-- with live columns (tem_acesso, pode_editar).
CREATE OR REPLACE FUNCTION public.auto_create_admin_cargo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cargo_id UUID;
BEGIN
  INSERT INTO public.cargos (nome, org_id)
  VALUES ('Administrador', NEW.id)
  RETURNING id INTO _cargo_id;

  INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar)
  SELECT _cargo_id, id, true, true
  FROM public.recursos
  ON CONFLICT (cargo_id, recurso_id) DO UPDATE
  SET tem_acesso = true, pode_editar = true;

  RETURN NEW;
END;
$$;
