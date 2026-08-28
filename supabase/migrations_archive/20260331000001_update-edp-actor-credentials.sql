-- Update EDP integration with new Actor ID and API Token
UPDATE public.plataformas_configuracao
SET
  apify_actor_id = '9Jfy0dN84fZJxF1Xr',
  apify_api_token = 'apify_api_zyXNhVu0c2aYqhETTy6fgfDI5ZNrOA3DM0vc'
WHERE robot_target_platform = 'edp';
