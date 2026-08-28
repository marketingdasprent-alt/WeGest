-- 1. Adicionar coluna cargo_id na tabela convites
ALTER TABLE public.convites 
ADD COLUMN IF NOT EXISTS cargo_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL;

-- 2. Atualizar a função handle_new_user para incluir cargo_id
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
    -- Usuários subsequentes: preencher cargo_id e cargo a partir do metadata
    INSERT INTO public.profiles (id, email, nome, cargo, cargo_id, is_admin)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
      NEW.raw_user_meta_data->>'cargo_nome',
      (NEW.raw_user_meta_data->>'cargo_id')::UUID,
      COALESCE((NEW.raw_user_meta_data->>'is_first_user')::boolean, FALSE)
    );
  END IF;
  RETURN NEW;
END;
$$;