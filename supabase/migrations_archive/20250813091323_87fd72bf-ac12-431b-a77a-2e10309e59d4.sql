-- Corrigir problemas de segurança identificados pelo linter

-- 1. Habilitar RLS nas tabelas que têm políticas mas RLS desabilitado
ALTER TABLE leads_encontro ENABLE ROW LEVEL SECURITY;

-- 2. Corrigir funções com search_path mutável
CREATE OR REPLACE FUNCTION public.get_gestores()
RETURNS TABLE(nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nome
  FROM public.profiles
  WHERE nome IS NOT NULL 
    AND cargo IS NOT NULL
    AND cargo != ''
  ORDER BY nome;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar se é o primeiro usuário
  IF (SELECT COUNT(*) FROM public.profiles) = 0 THEN
    -- Primeiro usuário é automaticamente admin
    INSERT INTO public.profiles (id, email, nome, is_admin)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
      TRUE
    );
  ELSE
    -- Usuários subsequentes não são admin por padrão
    INSERT INTO public.profiles (id, email, nome, is_admin)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
      COALESCE((NEW.raw_user_meta_data->>'is_first_user')::boolean, FALSE)
    );
  END IF;
  RETURN NEW;
END;
$$;