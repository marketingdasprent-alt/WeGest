-- ============================================================
-- Observações no cadastro do motorista
-- ============================================================
-- Caixa de texto livre que o candidato preenche no formulário de candidatura.
-- A equipa vê-a ao rever a candidatura (e pode passar para a ficha do motorista
-- na aprovação). Opcional.
-- ============================================================

ALTER TABLE public.motorista_candidaturas
  ADD COLUMN IF NOT EXISTS observacoes text;