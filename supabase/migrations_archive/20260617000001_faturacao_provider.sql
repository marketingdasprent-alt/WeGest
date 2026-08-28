-- ============================================================
-- Faturação fiscal agnóstica de provider (de-brand do KeyInvoice)
-- ============================================================
-- Torna a faturação fiscal independente de um software específico:
--   • as colunas do espelho `invoices` passam a ser genéricas (provider_*)
--   • a config (qual software + chave) passa a viver POR ORGANIZAÇÃO
--     (chave em plataformas_configuracao; slug público em org_definicoes).
-- KeyInvoice passa a ser apenas UM provider entre outros.
--
-- NÃO edita migrações antigas já aplicadas — é uma migração forward.
-- RENAME COLUMN é instantâneo/transacional: os dados existentes mantêm-se.
-- ============================================================

-- 1) invoices — colunas genéricas em vez de ki_*
ALTER TABLE public.invoices RENAME COLUMN ki_doctype TO provider_doctype;
ALTER TABLE public.invoices RENAME COLUMN ki_docnum  TO provider_docnum;

-- provider que emitiu o documento (ex.: 'keyinvoice', 'moloni', 'invoicexpress', ...)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS provider TEXT;
UPDATE public.invoices SET provider = 'keyinvoice' WHERE provider IS NULL;

COMMENT ON TABLE public.invoices IS
  'Espelho local dos documentos fiscais emitidos no software de faturação configurado (FT/FR/NC/RC). '
  'A conta-corrente local é a fonte de verdade; aqui guarda-se a referência legal + PDF.';
COMMENT ON COLUMN public.invoices.provider          IS 'Slug do provider de faturação que emitiu o documento (ex.: keyinvoice).';
COMMENT ON COLUMN public.invoices.provider_doctype  IS 'DocType do provider (usado para obter o PDF).';
COMMENT ON COLUMN public.invoices.provider_docnum   IS 'DocNum do provider (usado para obter o PDF).';

-- 2) plataformas_configuracao — saco de settings do provider de faturação
--    A linha de faturação usa plataforma='faturacao', client_secret=<chave>,
--    config = { provider, endpoint?, doctypes?, default_product?, default_idtax? }.
--    RLS já é admin-only nesta tabela (a chave nunca é exposta a utilizadores normais).
ALTER TABLE public.plataformas_configuracao ADD COLUMN IF NOT EXISTS config JSONB;
COMMENT ON COLUMN public.plataformas_configuracao.config IS
  'Settings específicos da integração. Faturação: { provider, endpoint?, doctypes?, default_product?, default_idtax? }.';

-- 3) org_definicoes — slug PÚBLICO do provider de faturação ativo
--    Legível por todos os utilizadores da org (RLS existente) — só para MOSTRAR o nome
--    do software na UI e decidir se se tenta emissão fiscal. A CHAVE nunca vive aqui.
ALTER TABLE public.org_definicoes ADD COLUMN IF NOT EXISTS faturacao_provider TEXT;
COMMENT ON COLUMN public.org_definicoes.faturacao_provider IS
  'Slug do software de faturação ativo da org (ex.: keyinvoice). A chave vive em plataformas_configuracao (admin-only).';
