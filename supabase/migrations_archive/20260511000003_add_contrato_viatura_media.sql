-- Número sequencial imutável para contratos
CREATE SEQUENCE IF NOT EXISTS contrato_numero_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS numero_contrato INTEGER;
ALTER TABLE contratos ALTER COLUMN numero_contrato SET DEFAULT nextval('contrato_numero_seq');

-- Preencher contratos existentes sequencialmente por data
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT id FROM contratos WHERE numero_contrato IS NULL ORDER BY criado_em) LOOP
    UPDATE contratos SET numero_contrato = nextval('contrato_numero_seq') WHERE id = r.id;
  END LOOP;
END $$;

-- Unique constraint no número
DO $$ BEGIN
  ALTER TABLE contratos ADD CONSTRAINT contratos_numero_contrato_unique UNIQUE (numero_contrato);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Associação a viatura e evento do calendário
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS viatura_id UUID REFERENCES viaturas(id);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS calendario_evento_id UUID;

-- Tabela de media (fotos/vídeos de checkout e checkin)
CREATE TABLE IF NOT EXISTS contrato_media (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id  UUID        NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  tipo         TEXT        NOT NULL CHECK (tipo IN ('checkout', 'checkin')),
  url          TEXT        NOT NULL,
  nome_ficheiro TEXT,
  tipo_ficheiro TEXT,
  tamanho_bytes BIGINT,
  criado_por   UUID        REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE contrato_media ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "auth_select_contrato_media" ON contrato_media FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth_insert_contrato_media" ON contrato_media FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth_delete_contrato_media" ON contrato_media FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bucket para media dos contratos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contrato-media', 'contrato-media', false, 104857600,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "auth_upload_contrato_media" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'contrato-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth_read_contrato_media" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'contrato-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth_delete_contrato_media" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'contrato-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
