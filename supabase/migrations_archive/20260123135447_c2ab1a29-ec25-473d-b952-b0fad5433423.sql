-- Adicionar colunas para os documentos adicionais na tabela motorista_candidaturas
ALTER TABLE public.motorista_candidaturas
ADD COLUMN registo_criminal_url TEXT,
ADD COLUMN comprovativo_morada_url TEXT,
ADD COLUMN comprovativo_iban_url TEXT;