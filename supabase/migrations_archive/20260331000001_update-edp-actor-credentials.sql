-- Credencial removida por exposição; provisionar o token fora do Git.
-- Update EDP integration with new Actor ID and API Token
UPDATE public.plataformas_configuracao
SET
  apify_actor_id = '9Jfy0dN84fZJxF1Xr'
WHERE robot_target_platform = 'edp';
