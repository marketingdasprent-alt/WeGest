-- ============================================================
-- Migration: clientes (renting) — PRODUCTION READY
-- ============================================================

-- ============================================================
-- ENUM documentos
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.tipo_documento_enum AS ENUM (
    'Cartão Cidadão',
    'Passaporte',
    'Autorização de Residência',
    'Carta de Condução',
    'Outro'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Helper RBAC (limpa policies)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_renting_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT is_current_user_admin()
  OR has_permission(auth.uid(), 'renting_clientes');
$$;


-- ============================================================
-- Trigger auditoria (updated_at + updated_by)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_audit_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


-- ============================================================
-- DOCUMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          public.tipo_documento_enum NOT NULL,
  numero        VARCHAR(50),
  pais_emissao  VARCHAR(100),
  data_emissao  DATE,
  validade      DATE,
  arquivo_url   TEXT,

  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT chk_doc_datas
    CHECK (data_emissao IS NULL OR validade IS NULL OR validade >= data_emissao)
);

CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON public.documentos(tipo);
CREATE INDEX IF NOT EXISTS idx_documentos_val  ON public.documentos(validade) WHERE validade IS NOT NULL;

-- evita duplicados reais
CREATE UNIQUE INDEX IF NOT EXISTS uq_documentos_tipo_numero
  ON public.documentos(tipo, numero)
  WHERE numero IS NOT NULL;

ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documentos_all" ON public.documentos
FOR ALL TO authenticated
USING (public.has_renting_access())
WITH CHECK (public.has_renting_access());

CREATE TRIGGER trg_documentos_audit
BEFORE UPDATE ON public.documentos
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_update();


-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clientes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          SERIAL UNIQUE,

  is_empresa      BOOLEAN NOT NULL DEFAULT false,

  nome            VARCHAR(255) NOT NULL,
  nome_comercial  VARCHAR(255),

  nif             VARCHAR(20),
  telefone        VARCHAR(50),
  email           VARCHAR(255),
  iban            VARCHAR(50),
  observacoes     TEXT,

  data_nascimento DATE,
  naturalidade    VARCHAR(100),

  codigo_postal   VARCHAR(20),
  localidade      VARCHAR(150),
  cidade          VARCHAR(150),
  pais            VARCHAR(100) DEFAULT 'Portugal',

  -- soft delete
  deleted_at      TIMESTAMPTZ,

  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- índices reais de uso
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON public.clientes(nome);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON public.clientes(is_empresa);
CREATE INDEX IF NOT EXISTS idx_clientes_nif ON public.clientes(nif) WHERE nif IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_email ON public.clientes(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_not_deleted ON public.clientes(deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_all" ON public.clientes
FOR ALL TO authenticated
USING (public.has_renting_access())
WITH CHECK (public.has_renting_access());

CREATE TRIGGER trg_clientes_audit
BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_update();


-- ============================================================
-- CLIENTE_DOCUMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cliente_documentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cliente_id    UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  documento_id  UUID NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,

  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_documento
ON public.cliente_documentos(cliente_id, documento_id);

CREATE INDEX IF NOT EXISTS idx_cli_doc_cliente ON public.cliente_documentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cli_doc_documento ON public.cliente_documentos(documento_id);

ALTER TABLE public.cliente_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cli_doc_all" ON public.cliente_documentos
FOR ALL TO authenticated
USING (public.has_renting_access())
WITH CHECK (public.has_renting_access());