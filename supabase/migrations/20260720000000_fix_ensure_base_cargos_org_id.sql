-- ============================================================
-- Fix: ensure_base_cargos falhava ao criar organização
-- ============================================================
-- O trigger trigger_auto_create_admin_cargo (AFTER INSERT ON organizacoes)
-- chama ensure_base_cargos, que insere em cargo_permissoes sem org_id.
-- Isto funcionava até 20260714150000 tornar cargo_permissoes.org_id
-- NOT NULL — desde então, toda a criação de organização falha com
-- "null value in column org_id of relation cargo_permissoes", porque o
-- trigger corre na mesma transação do INSERT em organizacoes e reverte-o.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_base_cargos(_org_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_id uuid;
BEGIN
  SELECT id INTO _admin_id
  FROM public.cargos
  WHERE org_id = _org_id AND btrim(lower(nome)) = 'administrador'
  ORDER BY created_at NULLS FIRST
  LIMIT 1;

  IF _admin_id IS NULL THEN
    INSERT INTO public.cargos (nome, org_id)
    VALUES ('Administrador', _org_id)
    RETURNING id INTO _admin_id;
  END IF;

  INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
  SELECT _admin_id, r.id, _org_id, true, true
  FROM public.recursos r
  ON CONFLICT (cargo_id, recurso_id) DO UPDATE
  SET tem_acesso = true, pode_editar = true;

  IF NOT EXISTS (
    SELECT 1 FROM public.cargos
    WHERE org_id = _org_id AND btrim(lower(nome)) = 'gestor tvde'
  ) THEN
    INSERT INTO public.cargos (nome, org_id) VALUES ('Gestor TVDE', _org_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cargos
    WHERE org_id = _org_id AND btrim(lower(nome)) = 'supervisor gestor tvde'
  ) THEN
    INSERT INTO public.cargos (nome, org_id) VALUES ('Supervisor Gestor TVDE', _org_id);
  END IF;
END;
$$;
