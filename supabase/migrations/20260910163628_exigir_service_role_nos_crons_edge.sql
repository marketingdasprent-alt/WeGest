-- Garante que workers internos recebem a service role, nunca a anon key.
-- A precondição aborta a migração antes de alterar a função se o segredo ainda
-- não tiver sido criado no Vault, evitando interromper os jobs em produção.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets AS segredo
    WHERE segredo.name = 'cron_service_role_jwt'
      AND NULLIF(BTRIM(segredo.decrypted_secret), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Criar primeiro o segredo cron_service_role_jwt no Vault; migração abortada sem alterações.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_invocar_edge(
  p_jobname TEXT,
  p_funcao TEXT,
  p_body JSONB DEFAULT '{}'::JSONB,
  p_timeout_ms INTEGER DEFAULT 60000
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url TEXT := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/' || p_funcao;
  v_jwt TEXT;
  v_request_id BIGINT;
BEGIN
  SELECT segredo.decrypted_secret
    INTO v_jwt
    FROM vault.decrypted_secrets AS segredo
   WHERE segredo.name = 'cron_service_role_jwt'
     AND NULLIF(BTRIM(segredo.decrypted_secret), '') IS NOT NULL
   LIMIT 1;

  IF v_jwt IS NULL THEN
    RAISE EXCEPTION 'cron_invocar_edge: cron_service_role_jwt não está disponível no Vault.';
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_jwt
    ),
    body := p_body,
    timeout_milliseconds := p_timeout_ms
  ) INTO v_request_id;

  INSERT INTO public.cron_http_log (jobname, url, request_id)
  VALUES (p_jobname, v_url, v_request_id);

  DELETE FROM public.cron_http_log
  WHERE invoked_at < NOW() - INTERVAL '7 days';

  RETURN v_request_id;
END;
$$;

ALTER FUNCTION public.cron_invocar_edge(TEXT, TEXT, JSONB, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cron_invocar_edge(TEXT, TEXT, JSONB, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_invocar_edge(TEXT, TEXT, JSONB, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.cron_invocar_edge(TEXT, TEXT, JSONB, INTEGER) IS
  'Invoca Edge Functions internas via pg_net usando exclusivamente cron_service_role_jwt do Vault; sem fallback para anon key.';

NOTIFY pgrst, 'reload schema';
