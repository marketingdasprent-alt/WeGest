-- ============================================================
-- Backfill empresas.org_id
-- ============================================================
-- A tabela `empresas` foi criada antes do multi-tenant — as duas
-- empresas existentes ficaram com org_id NULL. Sem esta ligação,
-- o gerador de PDF do contrato não consegue escolher o template
-- correcto (Distância Arrojada vs Década Ousada).
--
-- Mapeamento confirmado pelo user:
--   decada_ousada      → organizacoes.codigo = 'decada'
--   distancia_arrojada → organizacoes.codigo = 'distancia'
-- ============================================================

UPDATE public.empresas
   SET org_id = (SELECT id FROM public.organizacoes WHERE codigo = 'decada')
 WHERE id = 'decada_ousada'
   AND org_id IS NULL;

UPDATE public.empresas
   SET org_id = (SELECT id FROM public.organizacoes WHERE codigo = 'distancia')
 WHERE id = 'distancia_arrojada'
   AND org_id IS NULL;
