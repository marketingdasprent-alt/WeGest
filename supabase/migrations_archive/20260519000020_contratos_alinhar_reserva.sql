-- ============================================================
-- Contratos (Renting) — alinhamento com Reservas
-- ============================================================
-- Acrescenta a `contratos_renting`:
--   • Aluguer de longa duração + opção de renovação (ENUM tipado)
--   • Valores financeiros: franquia, caução, kms incluídos, valor por km adicional
--   • Observações internas
--
-- Garantias adicionais (vs Reservas):
--   • ENUM nativo para renovacao_opcao (não TEXT+CHECK) — tipo seguro, integrado em PostgREST
--   • Coerência de intervalo_dias: só preenchido quando renovacao_opcao = 'intervalo_dias'
--   • Trigger de imutabilidade: valores financeiros congelados quando facturado
--     (compliance SAF-T — só se pode alterar após anulação da factura)
-- ============================================================


-- ============================================================
-- ENUM tipado
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.contrato_renovacao_opcao_enum AS ENUM (
    'primeiro_dia_mes',
    'mesmo_dia_cada_mes',
    'intervalo_dias'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Colunas novas
-- ============================================================
ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS is_longa_duracao         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renovacao_opcao          public.contrato_renovacao_opcao_enum,
  ADD COLUMN IF NOT EXISTS renovacao_intervalo_dias integer,
  ADD COLUMN IF NOT EXISTS franquia_valor           numeric(10,2),
  ADD COLUMN IF NOT EXISTS caucao_valor             numeric(10,2),
  ADD COLUMN IF NOT EXISTS kms_incluidos            integer,
  ADD COLUMN IF NOT EXISTS km_adicional_valor       numeric(10,4),
  ADD COLUMN IF NOT EXISTS observacoes_internas     text;


-- ============================================================
-- CHECK constraints — coerência + não-negativos
-- ============================================================
DO $$
BEGIN
  -- Renovação só faz sentido com longa duração
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contratos_renovacao_requer_longa_duracao'
  ) THEN
    ALTER TABLE public.contratos_renting
      ADD CONSTRAINT contratos_renovacao_requer_longa_duracao
      CHECK (
        renovacao_opcao IS NULL
        OR is_longa_duracao = true
      );
  END IF;

  -- Intervalo só preenchido quando opção = intervalo_dias (e tem que ser > 0)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contratos_intervalo_dias_coerente'
  ) THEN
    ALTER TABLE public.contratos_renting
      ADD CONSTRAINT contratos_intervalo_dias_coerente
      CHECK (
        renovacao_intervalo_dias IS NULL
        OR (renovacao_opcao = 'intervalo_dias' AND renovacao_intervalo_dias > 0)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contratos_kms_incluidos_nao_negativos'
  ) THEN
    ALTER TABLE public.contratos_renting
      ADD CONSTRAINT contratos_kms_incluidos_nao_negativos
      CHECK (kms_incluidos IS NULL OR kms_incluidos >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contratos_valores_nao_negativos'
  ) THEN
    ALTER TABLE public.contratos_renting
      ADD CONSTRAINT contratos_valores_nao_negativos
      CHECK (
        (franquia_valor         IS NULL OR franquia_valor      >= 0)
        AND (caucao_valor       IS NULL OR caucao_valor        >= 0)
        AND (km_adicional_valor IS NULL OR km_adicional_valor  >= 0)
      );
  END IF;
END $$;


-- ============================================================
-- Trigger: imutabilidade dos inputs financeiros quando facturado
-- ------------------------------------------------------------
-- Quando `estado_financeiro = 'facturado'`, bloqueia mudanças nos
-- valores que alimentam a factura. Único caminho legítimo para
-- corrigir: transitar para 'anulado' (a anulação solta o lock).
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_contratos_imutabilidade_facturados()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Só aplica enquanto continua facturado.
  -- Transições facturado→anulado e anulado→pendente passam livremente.
  IF OLD.estado_financeiro = 'facturado' AND NEW.estado_financeiro = 'facturado' THEN
    IF (NEW.tarifa_diaria         IS DISTINCT FROM OLD.tarifa_diaria)
       OR (NEW.desconto_percentagem IS DISTINCT FROM OLD.desconto_percentagem)
       OR (NEW.taxa_iva             IS DISTINCT FROM OLD.taxa_iva)
       OR (NEW.valor_total_manual   IS DISTINCT FROM OLD.valor_total_manual)
       OR (NEW.franquia_valor       IS DISTINCT FROM OLD.franquia_valor)
       OR (NEW.caucao_valor         IS DISTINCT FROM OLD.caucao_valor)
       OR (NEW.kms_incluidos        IS DISTINCT FROM OLD.kms_incluidos)
       OR (NEW.km_adicional_valor   IS DISTINCT FROM OLD.km_adicional_valor)
    THEN
      RAISE EXCEPTION
        'Contrato facturado tem valores financeiros imutáveis. Anular a factura primeiro.'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contratos_imutabilidade_facturados ON public.contratos_renting;
CREATE TRIGGER trg_contratos_imutabilidade_facturados
BEFORE UPDATE OF
  tarifa_diaria, desconto_percentagem, taxa_iva, valor_total_manual,
  franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
  estado_financeiro
ON public.contratos_renting
FOR EACH ROW EXECUTE FUNCTION public.fn_contratos_imutabilidade_facturados();


-- ============================================================
-- Comentários
-- ============================================================
COMMENT ON COLUMN public.contratos_renting.is_longa_duracao IS
  'true = contrato de aluguer de longa duração com renovação periódica.';
COMMENT ON COLUMN public.contratos_renting.renovacao_opcao IS
  'Periodicidade da renovação. Só válido quando is_longa_duracao = true.';
COMMENT ON COLUMN public.contratos_renting.renovacao_intervalo_dias IS
  'Nº de dias entre renovações. Só preenchido quando renovacao_opcao = intervalo_dias.';
COMMENT ON COLUMN public.contratos_renting.kms_incluidos IS
  'Nº de kms incluídos no contrato. NULL = ilimitado.';
COMMENT ON COLUMN public.contratos_renting.km_adicional_valor IS
  'Custo por km acima de kms_incluidos (€/km).';
COMMENT ON COLUMN public.contratos_renting.observacoes_internas IS
  'Notas internas — não aparecem em documentos do cliente.';
