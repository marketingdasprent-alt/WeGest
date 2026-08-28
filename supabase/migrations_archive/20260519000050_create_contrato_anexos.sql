-- ============================================================
-- Anexos de contrato — tabela + bucket storage
-- ============================================================
-- Permite anexar ficheiros (PDF, imagens, docs) a um contrato.
-- Espelha a estrutura de `reserva_anexos`.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contrato_anexos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  contrato_id   uuid NOT NULL REFERENCES public.contratos_renting(id) ON DELETE CASCADE,

  nome          varchar(255) NOT NULL,   -- nome legível (renomeável)
  ficheiro_url  text         NOT NULL,   -- caminho no bucket (imutável)
  tamanho_bytes bigint,
  mime_type     text,
  descricao     text,

  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at    timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_contrato_anexos_contrato ON public.contrato_anexos (contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_anexos_org      ON public.contrato_anexos (org_id);


-- ============================================================
-- Trigger: preencher org_id a partir do contrato + touch updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_contrato_anexo_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.contratos_renting WHERE id = NEW.contrato_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_anexos_set_org_id ON public.contrato_anexos;
CREATE TRIGGER trg_contrato_anexos_set_org_id
  BEFORE INSERT ON public.contrato_anexos
  FOR EACH ROW EXECUTE FUNCTION public.set_contrato_anexo_org_id();

CREATE OR REPLACE FUNCTION public.touch_contrato_anexo_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_anexos_touch ON public.contrato_anexos;
CREATE TRIGGER trg_contrato_anexos_touch
  BEFORE UPDATE ON public.contrato_anexos
  FOR EACH ROW EXECUTE FUNCTION public.touch_contrato_anexo_updated_at();


-- ============================================================
-- RLS — usa helper has_renting_contratos_access() já existente
-- ============================================================
ALTER TABLE public.contrato_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contrato_anexos_select" ON public.contrato_anexos;
DROP POLICY IF EXISTS "contrato_anexos_insert" ON public.contrato_anexos;
DROP POLICY IF EXISTS "contrato_anexos_update" ON public.contrato_anexos;
DROP POLICY IF EXISTS "contrato_anexos_delete" ON public.contrato_anexos;

CREATE POLICY "contrato_anexos_select" ON public.contrato_anexos
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_contratos_access());

CREATE POLICY "contrato_anexos_insert" ON public.contrato_anexos
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND has_renting_contratos_access()
  );

CREATE POLICY "contrato_anexos_update" ON public.contrato_anexos
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_contratos_access())
  WITH CHECK (org_id = get_current_org_id() AND has_renting_contratos_access());

CREATE POLICY "contrato_anexos_delete" ON public.contrato_anexos
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_contratos_access());


-- ============================================================
-- Bucket de storage: contrato-anexos (20 MB, multi-mime)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contrato-anexos',
  'contrato-anexos',
  false,
  20971520, -- 20 MB
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
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies do bucket
DO $$ BEGIN
  CREATE POLICY "contrato_anexos_storage_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'contrato-anexos' AND public.has_renting_contratos_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "contrato_anexos_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'contrato-anexos' AND public.has_renting_contratos_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "contrato_anexos_storage_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'contrato-anexos' AND public.has_renting_contratos_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.contrato_anexos IS
  'Anexos por contrato (PDFs, imagens, docs). Nome legível é renomeável; ficheiro_url é o caminho imutável no bucket.';
