-- ============================================================
-- contrato_media: suportar contratos de renting (XOR)
-- ============================================================
-- A `contrato_media` foi criada para os contratos legacy
-- (`contrato_id REFERENCES contratos(id)`). O fluxo novo de
-- check-out/in por QR usa `contratos_renting` e não tinha onde
-- registar as fotos — só subiam para o storage.
--
-- Padrão XOR (igual aos condutores): adicionamos
-- `contrato_renting_id` nullable, tornamos `contrato_id` nullable,
-- e um CHECK garante que exactamente um dos dois está preenchido.
-- Não-destrutivo: linhas existentes têm contrato_id e passam o CHECK.
-- Reusa o bucket de storage `contrato-media`.
-- ============================================================

ALTER TABLE public.contrato_media
  ADD COLUMN IF NOT EXISTS contrato_renting_id uuid
    REFERENCES public.contratos_renting(id) ON DELETE CASCADE;

-- contrato_id deixa de ser obrigatório (continua FK para contratos legacy)
ALTER TABLE public.contrato_media
  ALTER COLUMN contrato_id DROP NOT NULL;

ALTER TABLE public.contrato_media
  DROP CONSTRAINT IF EXISTS contrato_media_xor_origem;
ALTER TABLE public.contrato_media
  ADD CONSTRAINT contrato_media_xor_origem
  CHECK ((contrato_id IS NULL) <> (contrato_renting_id IS NULL));

CREATE INDEX IF NOT EXISTS idx_contrato_media_renting
  ON public.contrato_media (contrato_renting_id)
  WHERE contrato_renting_id IS NOT NULL;

COMMENT ON COLUMN public.contrato_media.contrato_renting_id IS
  'Contrato de renting dono da media (XOR com contrato_id legacy). '
  'Preenchido pelo fluxo de check-out/in via QR.';
