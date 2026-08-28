
-- Adicionar coluna para tags/campanhas na tabela leads_dasprent
ALTER TABLE public.leads_dasprent 
ADD COLUMN campaign_tags TEXT[] DEFAULT '{}';

-- Criar índice para melhor performance em consultas de tags
CREATE INDEX idx_leads_dasprent_campaign_tags ON public.leads_dasprent USING GIN (campaign_tags);

-- Atualizar trigger para updated_at se ainda não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_leads_dasprent_updated_at'
  ) THEN
    CREATE TRIGGER update_leads_dasprent_updated_at 
    BEFORE UPDATE ON public.leads_dasprent 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
