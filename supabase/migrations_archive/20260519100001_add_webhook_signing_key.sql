-- Add webhook_signing_key column (the actual HMAC key, separate from OAuth client_secret)
ALTER TABLE plataformas_configuracao
  ADD COLUMN IF NOT EXISTS webhook_signing_key text;

-- Migrate: the current client_secret for webhook-mode Uber integrations
-- is actually the webhook signing key, not the OAuth secret.
-- Move it to the correct column.
UPDATE plataformas_configuracao
SET webhook_signing_key = client_secret,
    client_secret = NULL
WHERE plataforma = 'uber'
  AND auth_mode = 'webhook'
  AND client_secret IS NOT NULL
  AND webhook_signing_key IS NULL;

-- Update the RPC to also return webhook_signing_key
DROP FUNCTION IF EXISTS get_uber_platform_config(uuid);
CREATE OR REPLACE FUNCTION get_uber_platform_config(p_integracao_id uuid)
RETURNS TABLE(
  id uuid,
  nome text,
  plataforma text,
  client_id text,
  client_secret text,
  webhook_signing_key text,
  uber_scopes text[],
  redirect_uri text,
  privacy_policy_url text,
  webhook_url text,
  webhook_secret_hint text,
  uber_environment text,
  encryption_key_fingerprint text,
  oauth_state_secret_hint text,
  oauth_enabled boolean,
  ativo boolean
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    pc.id,
    pc.nome,
    pc.plataforma,
    pc.client_id,
    pc.client_secret,
    pc.webhook_signing_key,
    pc.uber_scopes,
    pc.redirect_uri,
    pc.privacy_policy_url,
    pc.webhook_url,
    pc.webhook_secret_hint,
    pc.uber_environment,
    pc.encryption_key_fingerprint,
    pc.oauth_state_secret_hint,
    pc.oauth_enabled,
    pc.ativo
  FROM public.plataformas_configuracao pc
  WHERE pc.id = p_integracao_id
    AND pc.plataforma = 'uber';
$$;

COMMENT ON COLUMN plataformas_configuracao.webhook_signing_key IS 'Uber webhook HMAC signing key (NOT the OAuth client_secret)';
