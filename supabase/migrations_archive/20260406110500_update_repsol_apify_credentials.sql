-- Atualização das credenciais do Apify para Repsol e Token Global
-- Data: 2026-04-06

-- 1. Atualizar o Token de API do Apify para todas as integrações de robô
UPDATE public.plataformas_configuracao
SET apify_api_token = 'apify_api_zyXNhVu0c2aYqhETTy6fgfDI5ZNrOA3DM0vc'
WHERE plataforma = 'robot';

-- 2. Atualizar o Actor ID específico da Repsol
UPDATE public.plataformas_configuracao
SET apify_actor_id = 'E6AO5pXQ55KnXO1fG'
WHERE (plataforma = 'robot' AND robot_target_platform = 'repsol') OR (plataforma = 'repsol');

-- 3. Atualizar o Actor ID específico da Bolt
UPDATE public.plataformas_configuracao
SET apify_actor_id = 'eaeRDaDAU3jqGqWoc'
WHERE (plataforma = 'robot' AND robot_target_platform = 'bolt') OR (plataforma = 'bolt');

-- 4. Atualizar o Actor ID específico da BP
UPDATE public.plataformas_configuracao
SET apify_actor_id = 'hKRIfwsrS4gr3fsRK'
WHERE (plataforma = 'robot' AND robot_target_platform = 'bp') OR (plataforma = 'bp');

-- 5. Atualizar o Actor ID específico da Uber
UPDATE public.plataformas_configuracao
SET apify_actor_id = 'V0XdIalMut9LfL17V'
WHERE (plataforma = 'robot' AND robot_target_platform = 'uber') OR (plataforma = 'uber');



