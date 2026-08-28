CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_first_user boolean;
  v_user_nome text;
  v_user_phone text;
  v_normalized_phone text;
  v_motorista_id uuid;
  v_is_motorista_signup boolean;
BEGIN
  v_is_first_user := (SELECT COUNT(*) = 0 FROM public.profiles);
  v_user_nome := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email);
  v_user_phone := NEW.raw_user_meta_data->>'telefone';
  v_normalized_phone := public.normalize_phone(v_user_phone);
  v_is_motorista_signup := COALESCE(NEW.raw_user_meta_data->>'cargo_nome', '') = 'Motorista';

  IF v_is_first_user THEN
    INSERT INTO public.profiles (id, email, nome, is_admin)
    VALUES (
      NEW.id,
      NEW.email,
      v_user_nome,
      TRUE
    );
  ELSE
    INSERT INTO public.profiles (id, email, nome, cargo, cargo_id, is_admin)
    VALUES (
      NEW.id,
      NEW.email,
      v_user_nome,
      NEW.raw_user_meta_data->>'cargo_nome',
      (NEW.raw_user_meta_data->>'cargo_id')::UUID,
      COALESCE((NEW.raw_user_meta_data->>'is_first_user')::boolean, FALSE)
    );
  END IF;

  IF v_is_motorista_signup AND v_normalized_phone IS NOT NULL THEN
    SELECT ma.id
    INTO v_motorista_id
    FROM public.motoristas_ativos ma
    WHERE ma.user_id IS NULL
      AND ma.telefone IS NOT NULL
      AND public.normalize_phone(ma.telefone) = v_normalized_phone
    ORDER BY ma.created_at ASC NULLS LAST, ma.id ASC
    LIMIT 1;

    IF v_motorista_id IS NOT NULL THEN
      UPDATE public.motoristas_ativos
      SET user_id = NEW.id,
          updated_at = now()
      WHERE id = v_motorista_id
        AND user_id IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;