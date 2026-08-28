-- Fix: Uber Açores e Uber Pró Peças tinham sync_automatico = false por engano.
-- Ambas devem sincronizar automaticamente todas as segundas-feiras.

UPDATE plataformas_configuracao
SET sync_automatico = true
WHERE nome IN ('Uber Açores', 'Uber Pró Peças')
  AND ativo = true;
