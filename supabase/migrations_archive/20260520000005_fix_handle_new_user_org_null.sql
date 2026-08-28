-- ============================================================
-- Fix: handle_new_user_org rebenta quando _org_id fica NULL
-- ============================================================
-- profiles.org_id é NOT NULL. No fluxo register-org o trigger
-- não encontrava org (_skip_org_assign) e tentava inserir
-- profiles com org_id = NULL → viola a constraint → o Supabase
-- devolve "Database error creating new user".
--
-- Correção:
--   1) ler org_id do metadata do signup, se fornecido;
--   2) garantia final: se ainda não há org, usar a org ativa
--      mais recente (no register-org é a que acabou de ser
--      criada; a Edge Function corrige a associação a seguir).
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

  -- org_id explícito no metadata do signup (se fornecido)
  IF _org_id IS NULL AND NEW.raw_user_meta_data->>'org_id' IS NOT NULL THEN
    _org_id := (NEW.raw_user_meta_data->>'org_id')::uuid;
  END IF;

  -- Se não encontrou convite com org, usar a primeira org disponível
  -- MAS SOMENTE se não é auto-registo (tem convite ou cargo explícito)
  IF _org_id IS NULL AND NOT _skip_org_assign THEN
    SELECT id INTO _org_id FROM public.organizacoes WHERE ativa = true ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Garantia final: profiles.org_id é NOT NULL. Se ainda não há org
  -- (ex.: fluxo register-org), usar a org ativa mais recente — a Edge
  -- Function register-org corrige a associação logo a seguir.
  IF _org_id IS NULL THEN
    SELECT id INTO _org_id FROM public.organizacoes
    WHERE ativa = true ORDER BY created_at DESC LIMIT 1;
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
