-- ============================================================
-- Fix: trigger não deve atribuir org default quando user se
-- regista via /registar-org. A Edge Function trata disso.
-- Também limpa associações incorretas do Luís Pereira.
-- ============================================================

-- 1. Corrigir trigger: não atribuir org quando tipo_utilizador = 'org_admin'
CREATE OR REPLACE FUNCTION public.handle_new_user_org()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _cargo_id uuid;
  _cargo_nome text;
  _is_first_user boolean;
  _user_nome text;
  _user_phone text;
  _normalized_phone text;
  _motorista_id uuid;
  _is_motorista_signup boolean;
  _tipo_utilizador text;
  _skip_org_assign boolean;
BEGIN
  -- Dados do user
  _is_first_user := (SELECT COUNT(*) = 0 FROM public.profiles);
  _user_nome := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1));
  _user_phone := NEW.raw_user_meta_data->>'telefone';
  _normalized_phone := public.normalize_phone(_user_phone);
  _is_motorista_signup := COALESCE(NEW.raw_user_meta_data->>'cargo_nome', '') = 'Motorista';
  _tipo_utilizador := COALESCE(NEW.raw_user_meta_data->>'tipo_utilizador',
                       CASE WHEN _is_motorista_signup THEN 'motorista' ELSE 'colaborador' END);

  -- Se o user está a ser criado via register-org, NÃO atribuir org aqui
  -- A Edge Function register-org vai associar à org correcta depois
  _skip_org_assign := (_tipo_utilizador = 'colaborador'
                       AND NEW.raw_user_meta_data->>'cargo_nome' IS NULL
                       AND NEW.raw_user_meta_data->>'cargo_id' IS NULL);

  -- Tentar obter org_id do convite (via email)
  SELECT c.org_id, c.cargo_id, cg.nome
  INTO _org_id, _cargo_id, _cargo_nome
  FROM public.convites c
  LEFT JOIN public.cargos cg ON cg.id = c.cargo_id
  WHERE c.email = NEW.email
    AND c.usado = false
  ORDER BY c.created_at DESC
  LIMIT 1;

  -- Se não encontrou convite, usar cargo do metadata
  IF _cargo_id IS NULL AND NEW.raw_user_meta_data->>'cargo_id' IS NOT NULL THEN
    _cargo_id := (NEW.raw_user_meta_data->>'cargo_id')::uuid;
    SELECT nome INTO _cargo_nome FROM public.cargos WHERE id = _cargo_id;
  END IF;

  -- Se não encontrou convite com org, usar a primeira org disponível
  -- MAS SOMENTE se não é auto-registo (tem convite ou cargo explícito)
  IF _org_id IS NULL AND NOT _skip_org_assign THEN
    SELECT id INTO _org_id FROM public.organizacoes WHERE ativa = true ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Criar/atualizar profile com org_id
  INSERT INTO public.profiles (id, email, nome, org_id, cargo_id, cargo, is_admin, tipo_utilizador)
  VALUES (
    NEW.id,
    NEW.email,
    _user_nome,
    _org_id,
    _cargo_id,
    _cargo_nome,
    COALESCE(_is_first_user, false),
    _tipo_utilizador
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = COALESCE(EXCLUDED.org_id, profiles.org_id),
    cargo_id = COALESCE(EXCLUDED.cargo_id, profiles.cargo_id),
    cargo = COALESCE(EXCLUDED.cargo, profiles.cargo),
    tipo_utilizador = COALESCE(EXCLUDED.tipo_utilizador, profiles.tipo_utilizador);

  -- Associar user à org
  IF _org_id IS NOT NULL THEN
    INSERT INTO public.user_organizacoes (user_id, org_id, role)
    VALUES (NEW.id, _org_id, 'member')
    ON CONFLICT (user_id, org_id) DO NOTHING;

    INSERT INTO public.user_org_ativa (user_id, org_id)
    VALUES (NEW.id, _org_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Ligar motorista existente pelo telefone
  IF _is_motorista_signup AND _normalized_phone IS NOT NULL THEN
    SELECT ma.id
    INTO _motorista_id
    FROM public.motoristas_ativos ma
    WHERE ma.user_id IS NULL
      AND ma.telefone IS NOT NULL
      AND public.normalize_phone(ma.telefone) = _normalized_phone
    ORDER BY ma.created_at ASC NULLS LAST, ma.id ASC
    LIMIT 1;

    IF _motorista_id IS NOT NULL THEN
      UPDATE public.motoristas_ativos
      SET user_id = NEW.id,
          updated_at = now()
      WHERE id = _motorista_id
        AND user_id IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Limpar associações incorretas do Luís Pereira (autofadataxi@gmail.com)
-- Remover de todas as orgs que NÃO são a dele (Auto Fada)
DO $$
DECLARE
  _user_id uuid;
  _own_org_id uuid;
BEGIN
  -- Encontrar o user
  SELECT id INTO _user_id FROM auth.users WHERE email = 'autofadataxi@gmail.com';

  IF _user_id IS NOT NULL THEN
    -- Encontrar a org dele (onde é owner)
    SELECT org_id INTO _own_org_id
    FROM public.user_organizacoes
    WHERE user_id = _user_id AND role = 'owner'
    LIMIT 1;

    IF _own_org_id IS NOT NULL THEN
      -- Remover de todas as outras orgs
      DELETE FROM public.user_organizacoes
      WHERE user_id = _user_id AND org_id != _own_org_id;

      -- Garantir que o profile aponta para a org correcta
      UPDATE public.profiles
      SET org_id = _own_org_id
      WHERE id = _user_id;

      -- Garantir org ativa correcta
      UPDATE public.user_org_ativa
      SET org_id = _own_org_id
      WHERE user_id = _user_id;

      RAISE NOTICE 'Luís Pereira corrigido: removido de orgs incorrectas, mantido em %', _own_org_id;
    END IF;
  END IF;
END;
$$;
