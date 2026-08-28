-- Add anti_captcha_key field to plataformas_configuracao
ALTER TABLE public.plataformas_configuracao
  ADD COLUMN IF NOT EXISTS anti_captcha_key TEXT;

-- Set the key on the existing EDP integration
UPDATE public.plataformas_configuracao
SET anti_captcha_key = '243bf598a01c1645d6c5a5ab329cfdf1'
WHERE robot_target_platform = 'edp';
