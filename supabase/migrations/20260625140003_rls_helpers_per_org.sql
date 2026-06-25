-- supabase/migrations/20260625140003_rls_helpers_per_org.sql
-- Helpers RLS passam a ler o papel do membership da org ativa.

-- is_current_user_admin()
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.user_organizacoes
     WHERE user_id = auth.uid()
       AND org_id = get_current_org_id()),
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- has_permission(uid, recurso)
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _recurso text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cargo_id uuid;
  _org_id uuid;
BEGIN
  _org_id := get_current_org_id();

  IF EXISTS (
    SELECT 1 FROM public.user_organizacoes
    WHERE user_id = _user_id AND org_id = _org_id AND is_admin = true
  ) THEN
    RETURN true;
  END IF;

  SELECT cargo_id INTO _cargo_id
  FROM public.user_organizacoes
  WHERE user_id = _user_id AND org_id = _org_id;

  IF _cargo_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cargo_permissoes cp
    JOIN public.recursos r ON cp.recurso_id = r.id
    WHERE cp.cargo_id = _cargo_id
      AND r.nome = _recurso
      AND cp.tem_acesso = true
  );
END;
$$;

-- has_permission(uid, recurso, acao) — fix das colunas mortas
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _recurso text, _acao text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cargo_id uuid;
  _org_id uuid;
BEGIN
  _org_id := get_current_org_id();

  IF EXISTS (
    SELECT 1 FROM public.user_organizacoes
    WHERE user_id = _user_id AND org_id = _org_id AND is_admin = true
  ) THEN
    RETURN true;
  END IF;

  SELECT cargo_id INTO _cargo_id
  FROM public.user_organizacoes
  WHERE user_id = _user_id AND org_id = _org_id;

  IF _cargo_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cargo_permissoes cp
    JOIN public.recursos r ON cp.recurso_id = r.id
    WHERE cp.cargo_id = _cargo_id
      AND r.nome = _recurso
      AND (
        (_acao IN ('ver','criar','deletar') AND cp.tem_acesso = true) OR
        (_acao = 'editar' AND cp.tem_acesso = true AND cp.pode_editar = true)
      )
  );
END;
$$;

-- can_edit(uid, recurso)
CREATE OR REPLACE FUNCTION public.can_edit(_user_id uuid, _recurso text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cargo_id uuid;
  _org_id uuid;
BEGIN
  _org_id := get_current_org_id();

  IF EXISTS (
    SELECT 1 FROM public.user_organizacoes
    WHERE user_id = _user_id AND org_id = _org_id AND is_admin = true
  ) THEN
    RETURN true;
  END IF;

  SELECT cargo_id INTO _cargo_id
  FROM public.user_organizacoes
  WHERE user_id = _user_id AND org_id = _org_id;

  IF _cargo_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cargo_permissoes cp
    JOIN public.recursos r ON cp.recurso_id = r.id
    WHERE cp.cargo_id   = _cargo_id
      AND r.nome        = _recurso
      AND cp.tem_acesso = true
      AND cp.pode_editar = true
  );
END;
$$;
