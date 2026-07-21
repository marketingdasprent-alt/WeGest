-- ============================================================
-- Documentos Suplementares — ficheiros estáticos (PDF/Word/imagem)
-- associáveis a várias empresas em simultâneo (ao contrário de
-- document_templates, que é 1 template → no máximo 1 empresa).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.documentos_suplementares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE
                  DEFAULT public.get_current_org_id(),
  nome          text NOT NULL,
  ficheiro_url  text NOT NULL,
  ficheiro_nome text NOT NULL,
  mime_type     text NOT NULL,
  tamanho_bytes bigint NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  criado_por    uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documentos_suplementares_org ON public.documentos_suplementares (org_id);

-- ============================================================
-- Junction: empresas associadas (many-to-many) — mesmo padrão de reserva_condutores
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_suplementar_empresas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE
                       DEFAULT public.get_current_org_id(),
  documento_id       uuid NOT NULL REFERENCES public.documentos_suplementares(id) ON DELETE CASCADE,
  cliente_empresa_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT documento_suplementar_empresas_unique UNIQUE (documento_id, cliente_empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_documento_suplementar_empresas_documento ON public.documento_suplementar_empresas (documento_id);
CREATE INDEX IF NOT EXISTS idx_documento_suplementar_empresas_empresa   ON public.documento_suplementar_empresas (cliente_empresa_id);
CREATE INDEX IF NOT EXISTS idx_documento_suplementar_empresas_org       ON public.documento_suplementar_empresas (org_id);

-- ============================================================
-- RLS — multi-tenant. Leitura aberta a qualquer utilizador autenticado da
-- org (GenerateDocumentsDialog precisa disto para utilizadores não-admin);
-- escrita só admin/admin_documentos — mesmo padrão de document_templates.
-- ============================================================
ALTER TABLE public.documentos_suplementares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_suplementar_empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_documentos_suplementares_select" ON public.documentos_suplementares;
DROP POLICY IF EXISTS "mt_documentos_suplementares_all" ON public.documentos_suplementares;

CREATE POLICY "mt_documentos_suplementares_select" ON public.documentos_suplementares
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_documentos_suplementares_all" ON public.documentos_suplementares
  FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_documentos')))
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_documentos')));

DROP POLICY IF EXISTS "mt_documento_suplementar_empresas_select" ON public.documento_suplementar_empresas;
DROP POLICY IF EXISTS "mt_documento_suplementar_empresas_all" ON public.documento_suplementar_empresas;

CREATE POLICY "mt_documento_suplementar_empresas_select" ON public.documento_suplementar_empresas
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_documento_suplementar_empresas_all" ON public.documento_suplementar_empresas
  FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_documentos')))
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_documentos')));

COMMENT ON TABLE public.documentos_suplementares IS
  'Ficheiros estáticos (PDF/Word/imagem) sem placeholders dinâmicos, associáveis a várias empresas.';
COMMENT ON TABLE public.documento_suplementar_empresas IS
  'Associação many-to-many entre documentos_suplementares e empresas (clientes com is_emissora=true).';

-- ============================================================
-- Bucket: documentos-suplementares (privado, PDF/Word/imagem, máx 10 MB)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos-suplementares',
  'documentos-suplementares',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "documentos_suplementares_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'documentos-suplementares');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "documentos_suplementares_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'documentos-suplementares'
      AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_documentos'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "documentos_suplementares_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'documentos-suplementares'
      AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_documentos'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "documentos_suplementares_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'documentos-suplementares'
      AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_documentos'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
