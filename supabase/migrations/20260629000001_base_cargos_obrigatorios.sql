-- ============================================================
-- 3 grupos (cargos) base OBRIGATÓRIOS em todas as organizações
-- ============================================================
--   • Administrador             → todas as permissões (gate is_admin)
--   • Gestor TVDE               → sem permissões (admin configura na UI)
--   • Supervisor de Gestor TVDE → sem permissões (admin configura na UI)
--
-- Idempotente e aditiva. O match de nome é case-insensitive e sem espaços
-- nas pontas, para NÃO duplicar cargos já existentes (ex.: "GESTOR TVDE"
-- em maiúsculas, criado à mão nalgumas orgs).
--
-- Substitui o antigo auto_create_admin_cargo (que só criava o Administrador).
-- ============================================================

-- Função reutilizável: garante os 3 cargos base numa org.
CREATE OR REPLACE FUNCTION public.ensure_base_cargos(_org_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_id uuid;
BEGIN
  -- 1) Administrador (com TODAS as permissões) ------------------------------
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

  -- Garantir todas as permissões no Administrador (tem_acesso + pode_editar).
  INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar)
  SELECT _admin_id, r.id, true, true
  FROM public.recursos r
  ON CONFLICT (cargo_id, recurso_id) DO UPDATE
  SET tem_acesso = true, pode_editar = true;

  -- 2) Gestor TVDE (sem permissões) -----------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.cargos
    WHERE org_id = _org_id AND btrim(lower(nome)) = 'gestor tvde'
  ) THEN
    INSERT INTO public.cargos (nome, org_id) VALUES ('Gestor TVDE', _org_id);
  END IF;

  -- 3) Supervisor de Gestor TVDE (sem permissões) ---------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.cargos
    WHERE org_id = _org_id AND btrim(lower(nome)) = 'supervisor de gestor tvde'
  ) THEN
    INSERT INTO public.cargos (nome, org_id) VALUES ('Supervisor de Gestor TVDE', _org_id);
  END IF;
END;
$$;

-- Trigger: ao criar uma org, garantir os 3 cargos base.
CREATE OR REPLACE FUNCTION public.auto_create_admin_cargo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_base_cargos(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_admin_cargo ON public.organizacoes;
CREATE TRIGGER trigger_auto_create_admin_cargo
AFTER INSERT ON public.organizacoes
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_admin_cargo();

-- Backfill: garantir os 3 cargos em TODAS as orgs já existentes.
DO $$
DECLARE _o record;
BEGIN
  FOR _o IN SELECT id FROM public.organizacoes LOOP
    PERFORM public.ensure_base_cargos(_o.id);
  END LOOP;
END $$;
