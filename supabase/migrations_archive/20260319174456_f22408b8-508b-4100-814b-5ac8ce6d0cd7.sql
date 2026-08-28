ALTER TABLE public.plataformas_configuracao
  ADD COLUMN IF NOT EXISTS auth_mode TEXT DEFAULT 'password',
  ADD COLUMN IF NOT EXISTS cookies_json TEXT;