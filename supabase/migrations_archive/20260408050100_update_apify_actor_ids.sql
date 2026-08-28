-- Atualizar Actor IDs do Apify por plataforma

UPDATE public.plataformas_configuracao
SET apify_actor_id = 'oxSsBFAY3sZ9okulu'
WHERE plataforma = 'robot' AND robot_target_platform = 'edp'
   OR plataforma = 'edp';

UPDATE public.plataformas_configuracao
SET apify_actor_id = 'vIHsbzNJFqAdQt9pL'
WHERE plataforma = 'robot' AND robot_target_platform = 'bolt'
   OR plataforma = 'bolt';

UPDATE public.plataformas_configuracao
SET apify_actor_id = '7ouNjwQa9N3VrnuxQ'
WHERE plataforma = 'robot' AND robot_target_platform = 'bp'
   OR plataforma = 'bp';

UPDATE public.plataformas_configuracao
SET apify_actor_id = 'NGvoNyWJ3gK6lx6m9'
WHERE plataforma = 'robot' AND robot_target_platform = 'uber'
   OR plataforma = 'uber';

UPDATE public.plataformas_configuracao
SET apify_actor_id = 'gRxFn6VHoRdChqbWh'
WHERE plataforma = 'robot' AND robot_target_platform = 'repsol'
   OR plataforma = 'repsol';
