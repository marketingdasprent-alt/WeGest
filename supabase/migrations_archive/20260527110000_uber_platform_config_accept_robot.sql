-- ============================================================
-- get_uber_platform_config aceita robot+target=uber
-- ============================================================
-- Antes só aceitava plataforma='uber' estrito. Integrações criadas
-- como 'robot' com robot_target_platform='uber' (caso comum na
-- Década Ousada) faziam o uber-webhook devolver 404 ao importar CSV.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_uber_platform_config(p_integracao_id uuid)
RETURNS TABLE(
  id uuid, nome text, plataforma text, client_id text, client_secret text,
  webhook_signing_key text, uber_scopes text[], redirect_uri text,
  privacy_policy_url text, webhook_url text, webhook_secret_hint text,
  uber_environment text, encryption_key_fingerprint text,
  oauth_state_secret_hint text, oauth_enabled boolean, ativo boolean
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    pc.id, pc.nome, pc.plataforma, pc.client_id, pc.client_secret,
    pc.webhook_signing_key, pc.uber_scopes, pc.redirect_uri,
    pc.privacy_policy_url, pc.webhook_url, pc.webhook_secret_hint,
    pc.uber_environment, pc.encryption_key_fingerprint,
    pc.oauth_state_secret_hint, pc.oauth_enabled, pc.ativo
  FROM public.plataformas_configuracao pc
  WHERE pc.id = p_integracao_id
    AND (pc.plataforma = 'uber'
         OR (pc.plataforma = 'robot' AND pc.robot_target_platform = 'uber'));
$$;
