-- ============================================================
-- Campos adicionais para registo de organizações
-- ============================================================

ALTER TABLE public.organizacoes
  ADD COLUMN IF NOT EXISTS nif text,
  ADD COLUMN IF NOT EXISTS morada text,
  ADD COLUMN IF NOT EXISTS telefone text;

-- Permitir leitura pública da tabela organizacoes para validação de código
-- (necessário para o formulário de registo verificar se o código já existe)
CREATE POLICY "Permitir verificar codigo de org publicamente"
  ON public.organizacoes FOR SELECT
  USING (true);
