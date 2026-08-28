-- ============================================================
-- Feature: DUA original com o motorista (contrato de renting)
-- ============================================================
-- Marca no contrato que o MOTORISTA levou a DUA ORIGINAL (física) da viatura
-- com ele. Serve para:
--   • dua_original_com_motorista — flag definida na criação/edição do contrato;
--   • dua_observacoes            — nota livre (ex.: quem recebeu, condições);
--   • dua_devolvida_em           — carimbo de quando a DUA foi devolvida, escrito
--                                  SÓ no fecho do contrato (FecharContratoDialog),
--                                  nunca no formulário. NULL = ainda não devolvida.
--
-- O aviso "este motorista saiu com a DUA original e tem de a devolver ao fechar"
-- aparece enquanto dua_original_com_motorista = true E dua_devolvida_em IS NULL.
--
-- Os documentos relacionados com a DUA reutilizam o separador Anexos do contrato
-- (tabela contrato_anexos) — sem tabela nova.
-- ============================================================

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS dua_original_com_motorista boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dua_devolvida_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dua_observacoes text NULL;

COMMENT ON COLUMN public.contratos_renting.dua_original_com_motorista IS
  'true = o motorista levou a DUA ORIGINAL (física) da viatura. Aviso de devolução ativo enquanto dua_devolvida_em IS NULL.';
COMMENT ON COLUMN public.contratos_renting.dua_devolvida_em IS
  'Quando a DUA original foi devolvida. Escrito só no fecho do contrato (FecharContratoDialog), não no formulário.';
COMMENT ON COLUMN public.contratos_renting.dua_observacoes IS
  'Nota livre sobre a DUA original que o motorista levou (opcional).';
