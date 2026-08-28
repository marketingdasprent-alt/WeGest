-- ============================================================
-- Data de fim REAL nos contratos de prestação de serviços
-- ============================================================
-- A tabela `contratos` (prestação) não tinha data de fim — o dashboard
-- derivava data_inicio + duracao_meses (com fallback a 12 meses quando a
-- duração estava vazia, uma adivinha). Passa a existir uma coluna data_fim
-- REAL e editável:
--   • backfill dos contratos existentes a partir de data_inicio + duracao_meses;
--   • trigger que preenche data_fim = data_inicio + duracao_meses quando fica
--     NULL (na criação ou edição) — mantém a coluna sempre coerente sem obrigar
--     a mexer no fluxo de criação; um valor definido à mão é respeitado.
-- O dashboard passa a usar esta data (ver Dashboard.tsx), sem adivinhas.
-- ============================================================

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS data_fim date NULL;

COMMENT ON COLUMN public.contratos.data_fim IS
  'Data de fim/renovação do contrato de prestação. Preenchida por trigger a '
  'partir de data_inicio + duracao_meses quando NULL; editável no formulário.';

-- Backfill dos existentes.
UPDATE public.contratos
   SET data_fim = (data_inicio + (duracao_meses || ' months')::interval)::date
 WHERE data_fim IS NULL
   AND data_inicio IS NOT NULL
   AND duracao_meses IS NOT NULL;

-- Trigger de coerência: só calcula quando data_fim está NULL (respeita override).
CREATE OR REPLACE FUNCTION public.contratos_preencher_data_fim()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.data_fim IS NULL
     AND NEW.data_inicio IS NOT NULL
     AND NEW.duracao_meses IS NOT NULL THEN
    NEW.data_fim := (NEW.data_inicio + (NEW.duracao_meses || ' months')::interval)::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contratos_preencher_data_fim ON public.contratos;
CREATE TRIGGER trg_contratos_preencher_data_fim
  BEFORE INSERT OR UPDATE OF data_inicio, duracao_meses, data_fim
  ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.contratos_preencher_data_fim();
