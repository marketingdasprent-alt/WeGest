-- 1. Limpar itens da Via Verde que estão travando a fila ou gerando erros
-- Via Verde está temporariamente desativada ou não reconhecida pelo orquestrador.
DELETE FROM public.sync_queue 
WHERE plataforma = 'via_verde';

-- 2. Resetar itens que falharam por "Plataforma desconhecida"
-- Agora que o orquestrador reconhece repsol e edp, podemos tentar novamente.
UPDATE public.sync_queue
SET 
  status = 'pending',
  started_at = NULL,
  completed_at = NULL,
  error_message = NULL
WHERE status = 'failed' 
  AND error_message LIKE 'Plataforma desconhecida:%';

-- 3. Garantir que as plataformas repsol e edp tenham robot_target_platform preenchido
-- Isso ajuda na lógica de busca de masterConfig no robot-execute.
UPDATE public.plataformas_configuracao
SET robot_target_platform = 'repsol'
WHERE plataforma = 'repsol' AND (robot_target_platform IS NULL OR robot_target_platform = '');

UPDATE public.plataformas_configuracao
SET robot_target_platform = 'edp'
WHERE plataforma = 'edp' AND (robot_target_platform IS NULL OR robot_target_platform = '');

-- Comentário para documentação
COMMENT ON TABLE public.sync_queue IS 'Fila de sincronização automatizada para robôs e integrações API';
