-- ============================================================
-- Migração: document_templates → cliente_empresa_id
-- As empresas passam a ser clientes de tipo='empresa'.
-- document_templates ganha uma FK para clientes(id) (UUID).
-- empresa_id (TEXT slug) mantém-se nullable para compat.
-- clientes ganha campos específicos de empresa para usar nos PDFs.
-- ============================================================

-- 1. Campos empresa nos clientes (nullable — só usados quando tipo_cliente='empresa')
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS sede TEXT,
  ADD COLUMN IF NOT EXISTS representante TEXT,
  ADD COLUMN IF NOT EXISTS cargo_representante TEXT,
  ADD COLUMN IF NOT EXISTS licenca_tvde TEXT,
  ADD COLUMN IF NOT EXISTS licenca_validade DATE,
  ADD COLUMN IF NOT EXISTS papel_timbrado TEXT;

-- 2. Tornar empresa_id nullable em document_templates
--    (o UNIQUE existente em empresa_id,tipo,versao continua a funcionar;
--     NULL != NULL em unicidade, portanto várias linhas com empresa_id NULL não conflituam)
ALTER TABLE public.document_templates
  ALTER COLUMN empresa_id DROP NOT NULL;

-- 3. Nova FK para clientes
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS cliente_empresa_id UUID
    REFERENCES public.clientes(id) ON DELETE SET NULL;

-- Índice de busca
CREATE INDEX IF NOT EXISTS idx_doc_templates_cliente_empresa
  ON public.document_templates(cliente_empresa_id)
  WHERE cliente_empresa_id IS NOT NULL;

-- Índice único pelo novo eixo (parcial — só onde cliente_empresa_id está preenchido)
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_templates_cliente_tipo_versao
  ON public.document_templates(cliente_empresa_id, tipo, versao)
  WHERE cliente_empresa_id IS NOT NULL;

-- 5. Remover o CHECK constraint de empresa_id na tabela contratos
--    (era uma lista fixa de slugs; passa a aceitar qualquer string, incluindo UUIDs de clientes)
ALTER TABLE public.contratos
  DROP CONSTRAINT IF EXISTS contratos_empresa_check;
