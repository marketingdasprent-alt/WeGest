-- ============================================================
-- Tabela cliente_anexos + bucket storage para PDFs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cliente_anexos (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id    UUID        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,

  nome          VARCHAR(255) NOT NULL,         -- nome legível (do utilizador)
  ficheiro_url  TEXT         NOT NULL,         -- caminho no bucket
  tamanho_bytes BIGINT,                        -- para mostrar "1.2 MB"
  descricao     TEXT,                          -- opcional

  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_cliente_anexos_cliente
  ON public.cliente_anexos(cliente_id);

ALTER TABLE public.cliente_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_anexos_all" ON public.cliente_anexos
FOR ALL TO authenticated
USING (public.has_renting_access())
WITH CHECK (public.has_renting_access());


-- ============================================================
-- Bucket: cliente-anexos (apenas PDFs, máx 10 MB)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cliente-anexos',
  'cliente-anexos',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket: qualquer authenticated com renting access
DO $$ BEGIN
  CREATE POLICY "cliente_anexos_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'cliente-anexos' AND public.has_renting_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cliente_anexos_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'cliente-anexos' AND public.has_renting_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cliente_anexos_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'cliente-anexos' AND public.has_renting_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
