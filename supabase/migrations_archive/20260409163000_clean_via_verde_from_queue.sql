-- Remover completamente itens soltos da via_verde da fila de sincronização
DELETE FROM public.sync_queue WHERE plataforma = 'via_verde';

-- Inativar todas as integrações da Via Verde
UPDATE public.plataformas_configuracao
SET ativo = false
WHERE plataforma = 'via_verde';
