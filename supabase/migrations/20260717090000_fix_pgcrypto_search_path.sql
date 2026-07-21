-- ============================================================
-- Fix: pgp_sym_encrypt/decrypt não resolvem com search_path=public
-- ============================================================
-- pgcrypto foi instalada no schema `extensions` (padrão do Supabase), não em
-- `public`. set_email_api_key/get_email_api_key tinham SET search_path=public
-- só, por isso pgp_sym_encrypt/pgp_sym_decrypt davam "function does not
-- exist" (42883). Adiciona `extensions` ao search_path — resto da função
-- inalterado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_email_api_key(p_integracao_id uuid, p_api_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_encryption_key text;
  v_updated int;
BEGIN
  SELECT decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_encryption_key';

  IF v_encryption_key IS NULL THEN
    RAISE EXCEPTION 'email_encryption_key não configurado no Supabase Vault';
  END IF;

  UPDATE public.plataformas_configuracao
  SET email_api_key_encrypted = pgp_sym_encrypt(p_api_key, v_encryption_key),
      updated_at = now()
  WHERE id = p_integracao_id
    AND plataforma = 'email'
    AND org_id = public.get_current_org_id()
    AND public.is_current_user_admin();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Integração de email não encontrada ou sem permissão';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_email_api_key(p_integracao_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_encryption_key text;
  v_encrypted bytea;
BEGIN
  SELECT decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_encryption_key';

  IF v_encryption_key IS NULL THEN
    RAISE EXCEPTION 'email_encryption_key não configurado no Supabase Vault';
  END IF;

  SELECT email_api_key_encrypted INTO v_encrypted
  FROM public.plataformas_configuracao
  WHERE id = p_integracao_id AND plataforma = 'email';

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN pgp_sym_decrypt(v_encrypted, v_encryption_key);
END;
$$;
