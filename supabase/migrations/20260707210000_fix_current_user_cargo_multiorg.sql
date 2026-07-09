-- ============================================================
-- Fix: current_user_cargo() lia profiles.cargo (legado, single-org,
-- texto nunca sincronizado com o RBAC actual)
-- ============================================================
-- current_user_cargo() é usada em RLS/RPCs para reconhecer "Supervisor
-- Gestor TVDE" (escalonamento, lista de espera de viatura, etc). Lia
-- profiles.cargo — campo de texto livre legado, anterior ao multi-org,
-- que nunca é sincronizado com user_organizacoes.cargo_id (o RBAC
-- actual). Na prática nenhuma org com cargo criado por
-- ensure_base_cargos (20260629000001, texto 'Supervisor de Gestor TVDE')
-- conseguia bater com a comparação exacta 'Supervisor Gestor TVDE' usada
-- nas RLS/RPCs — o cargo nem vinha de lá.
--
-- Fix: ler o nome do cargo da org activa via user_organizacoes.cargo_id
-- → cargos.nome. Mantém fallback em profiles.cargo só para o caso raro
-- de ainda não haver membership (não deve acontecer em produção, mas
-- evita quebrar chamadas antigas).
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_cargo()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT c.nome
        FROM public.user_organizacoes uo
        JOIN public.cargos c ON c.id = uo.cargo_id
       WHERE uo.user_id = auth.uid()
         AND uo.org_id  = public.get_current_org_id()
       LIMIT 1
    ),
    (SELECT cargo FROM public.profiles WHERE id = auth.uid())
  );
$$;

-- As comparações existentes em RLS/RPCs usam a string exacta
-- 'Supervisor Gestor TVDE' (sem "de") — alinhar o texto do cargo base
-- para bater, em vez de reescrever todas as comparações espalhadas.
UPDATE public.cargos
   SET nome = 'Supervisor Gestor TVDE'
 WHERE btrim(lower(nome)) = 'supervisor de gestor tvde';

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

  INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar)
  SELECT _admin_id, r.id, true, true
  FROM public.recursos r
  ON CONFLICT (cargo_id, recurso_id) DO UPDATE
  SET tem_acesso = true, pode_editar = true;

  IF NOT EXISTS (
    SELECT 1 FROM public.cargos
    WHERE org_id = _org_id AND btrim(lower(nome)) = 'gestor tvde'
  ) THEN
    INSERT INTO public.cargos (nome, org_id) VALUES ('Gestor TVDE', _org_id);
  END IF;

  -- Texto alinhado com a comparação exacta usada em RLS/RPCs
  -- ('Supervisor Gestor TVDE', sem "de") — ver correcção acima.
  IF NOT EXISTS (
    SELECT 1 FROM public.cargos
    WHERE org_id = _org_id AND btrim(lower(nome)) = 'supervisor gestor tvde'
  ) THEN
    INSERT INTO public.cargos (nome, org_id) VALUES ('Supervisor Gestor TVDE', _org_id);
  END IF;
END;
$$;
