-- Adicionar campo para foto do motorista
ALTER TABLE public.motoristas_ativos 
ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- Comentário para documentação do campo
COMMENT ON COLUMN public.motoristas_ativos.foto_url IS 'URL da foto de perfil enviada pelo motorista ou gerida pela admin.';
