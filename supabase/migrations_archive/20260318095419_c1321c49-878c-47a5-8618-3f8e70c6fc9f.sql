ALTER TABLE public.plataformas_configuracao
  ADD COLUMN IF NOT EXISTS uber_access_token text,
  ADD COLUMN IF NOT EXISTS uber_refresh_token text,
  ADD COLUMN IF NOT EXISTS uber_token_expires_at timestamptz;