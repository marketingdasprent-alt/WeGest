-- ============================================================
-- Duas integrações de faturação não podem partilhar a mesma chave
-- ============================================================
-- A migração anterior (20260917150000) pôs cada integração de faturação ao
-- serviço de UMA empresa emissora. Faltava o reverso: nada impedia criar duas
-- integrações, para duas empresas diferentes, com a MESMA chave de API.
--
-- Isso reporia exactamente o problema que se foi corrigir. Uma chave da
-- KeyInvoice é a conta de UMA empresa: duas empresas a apontar para a mesma
-- chave é uma delas a emitir com o NIF da outra — foi assim que uma só conta
-- emitiu 199 facturas em nome de cinco empresas.
--
-- Uma organização pode ter tantas integrações do mesmo provider quantas
-- quiser, desde que cada uma traga a sua própria chave.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_faturacao_chave_por_org
  ON public.plataformas_configuracao (org_id, client_secret)
  WHERE plataforma = 'faturacao' AND client_secret IS NOT NULL;

COMMENT ON INDEX public.uq_faturacao_chave_por_org IS
  'Uma chave de faturação serve uma só integração. Duas empresas com a mesma chave significaria uma delas a emitir com o NIF da outra.';

NOTIFY pgrst, 'reload schema';
