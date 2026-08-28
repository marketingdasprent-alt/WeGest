-- Configurar Realtime para atualizações automáticas
-- Ativar REPLICA IDENTITY FULL para capturar dados completos das mudanças
ALTER TABLE leads_dasprent REPLICA IDENTITY FULL;
ALTER TABLE lead_status_history REPLICA IDENTITY FULL;

-- Adicionar tabelas à publicação do realtime
-- Isso permite que as mudanças sejam transmitidas em tempo real
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Se a publicação não existir para as tabelas, adicionar
DO $$ 
BEGIN
    -- Verificar se leads_dasprent está na publicação
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'leads_dasprent'
    ) THEN
        -- Adicionar tabela à publicação realtime
        ALTER PUBLICATION supabase_realtime ADD TABLE leads_dasprent;
    END IF;

    -- Verificar se lead_status_history está na publicação
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'lead_status_history'
    ) THEN
        -- Adicionar tabela à publicação realtime
        ALTER PUBLICATION supabase_realtime ADD TABLE lead_status_history;
    END IF;
END $$;