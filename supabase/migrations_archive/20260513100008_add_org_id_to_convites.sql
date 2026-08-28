-- ============================================================
-- Adicionar org_id à tabela convites + handle-new-user org-aware
-- ============================================================

-- Adicionar org_id à tabela de convites
ALTER TABLE public.convites ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizacoes(id);
ALTER TABLE public.convites ALTER COLUMN org_id SET DEFAULT get_current_org_id();
CREATE INDEX IF NOT EXISTS idx_convites_org ON public.convites(org_id);

-- Migrar convites existentes para Década
UPDATE public.convites SET org_id = '11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;

-- ============================================================
-- Trigger: quando um novo user é criado via auth.users,
-- associar automaticamente à org do convite (se existir)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_org()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _cargo_id uuid;
  _cargo_nome text;
BEGIN
  -- Tentar obter org_id do convite (via email)
  SELECT c.org_id, c.cargo_id, cg.nome
  INTO _org_id, _cargo_id, _cargo_nome
  FROM public.convites c
  LEFT JOIN public.cargos cg ON cg.id = c.cargo_id
  WHERE c.email = NEW.email
    AND c.usado = false
  ORDER BY c.created_at DESC
  LIMIT 1;

  -- Se não encontrou convite com org, usar a primeira org disponível
  IF _org_id IS NULL THEN
    SELECT id INTO _org_id FROM public.organizacoes WHERE ativa = true LIMIT 1;
  END IF;

  -- Criar/atualizar profile com org_id
  INSERT INTO public.profiles (id, email, nome, org_id, cargo_id, cargo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    _org_id,
    _cargo_id,
    _cargo_nome
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = COALESCE(EXCLUDED.org_id, profiles.org_id),
    cargo_id = COALESCE(EXCLUDED.cargo_id, profiles.cargo_id),
    cargo = COALESCE(EXCLUDED.cargo, profiles.cargo);

  -- Associar user à org
  IF _org_id IS NOT NULL THEN
    INSERT INTO public.user_organizacoes (user_id, org_id, role)
    VALUES (NEW.id, _org_id, 'member')
    ON CONFLICT (user_id, org_id) DO NOTHING;

    INSERT INTO public.user_org_ativa (user_id, org_id)
    VALUES (NEW.id, _org_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Criar trigger se não existir (drop + create para garantir atualização)
DROP TRIGGER IF EXISTS on_auth_user_created_org ON auth.users;
CREATE TRIGGER on_auth_user_created_org
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_org();
