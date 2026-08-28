-- ============================================================
-- Anexos de reserva — tabela + bucket storage
-- ============================================================
-- Permite anexar ficheiros (PDF, imagens, docs) a uma reserva.
-- O `nome` é o nome legível mostrado ao utilizador (renomeável);
-- o `ficheiro_url` é o caminho imutável no bucket.
-- ============================================================

-- ------------------------------------------------------------
-- Helper de acesso (mantém policies legíveis)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_renting_reservas_access()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT is_current_user_admin()
  OR has_permission(auth.uid(), 'renting_reservas');
$$;

-- ------------------------------------------------------------
-- Tabela
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reserva_anexos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  reserva_id    uuid NOT NULL REFERENCES public.reservas(id) ON DELETE CASCADE,

  nome          varchar(255) NOT NULL,   -- nome legível (renomeável)
  ficheiro_url  text         NOT NULL,   -- caminho no bucket (imutável)
  tamanho_bytes bigint,
  mime_type     text,
  descricao     text,

  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at    timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_reserva_anexos_reserva ON public.reserva_anexos (reserva_id);
CREATE INDEX IF NOT EXISTS idx_reserva_anexos_org     ON public.reserva_anexos (org_id);

-- ------------------------------------------------------------
-- Trigger: preencher org_id a partir da reserva + updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_reserva_anexo_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.reservas WHERE id = NEW.reserva_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reserva_anexos_set_org_id ON public.reserva_anexos;
CREATE TRIGGER trg_reserva_anexos_set_org_id
  BEFORE INSERT ON public.reserva_anexos
  FOR EACH ROW EXECUTE FUNCTION public.set_reserva_anexo_org_id();

CREATE OR REPLACE FUNCTION public.touch_reserva_anexo_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reserva_anexos_touch ON public.reserva_anexos;
CREATE TRIGGER trg_reserva_anexos_touch
  BEFORE UPDATE ON public.reserva_anexos
  FOR EACH ROW EXECUTE FUNCTION public.touch_reserva_anexo_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.reserva_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reserva_anexos_select" ON public.reserva_anexos;
DROP POLICY IF EXISTS "reserva_anexos_insert" ON public.reserva_anexos;
DROP POLICY IF EXISTS "reserva_anexos_update" ON public.reserva_anexos;
DROP POLICY IF EXISTS "reserva_anexos_delete" ON public.reserva_anexos;

CREATE POLICY "reserva_anexos_select" ON public.reserva_anexos
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_reservas_access());

CREATE POLICY "reserva_anexos_insert" ON public.reserva_anexos
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND has_renting_reservas_access()
  );

CREATE POLICY "reserva_anexos_update" ON public.reserva_anexos
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_reservas_access())
  WITH CHECK (org_id = get_current_org_id() AND has_renting_reservas_access());

CREATE POLICY "reserva_anexos_delete" ON public.reserva_anexos
  FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_reservas_access());

-- ============================================================
-- Bucket de storage
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reserva-anexos',
  'reserva-anexos',
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
  CREATE POLICY "reserva_anexos_storage_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'reserva-anexos' AND public.has_renting_reservas_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "reserva_anexos_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'reserva-anexos' AND public.has_renting_reservas_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "reserva_anexos_storage_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'reserva-anexos' AND public.has_renting_reservas_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.reserva_anexos IS
  'Anexos por reserva (PDFs, imagens, docs). Nome legível é renomeável; ficheiro_url é o caminho imutável no bucket.';
