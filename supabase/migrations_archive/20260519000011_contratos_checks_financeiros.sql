-- ============================================================
-- Migration: contratos_renting — CHECKs financeiros defensivos
-- ============================================================
-- Garantir que campos monetários nunca aceitam negativos,
-- mesmo se alguém faz INSERT/UPDATE directo via SQL.
--
-- Idempotente: blocos DO $$ apanham duplicate_object.
-- ============================================================

-- tarifa_diaria >= 0
DO $$ BEGIN
  ALTER TABLE public.contratos_renting
    ADD CONSTRAINT chk_contratos_tarifa_diaria_valida
    CHECK (tarifa_diaria IS NULL OR tarifa_diaria >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- valor_total_manual >= 0
DO $$ BEGIN
  ALTER TABLE public.contratos_renting
    ADD CONSTRAINT chk_contratos_valor_total_manual_valido
    CHECK (valor_total_manual IS NULL OR valor_total_manual >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Snapshot de totais >= 0 (defesa contra trigger bugado no futuro)
DO $$ BEGIN
  ALTER TABLE public.contratos_renting
    ADD CONSTRAINT chk_contratos_snapshot_totais_validos
    CHECK (
      (total_subtotal IS NULL OR total_subtotal >= 0)
      AND (total_iva IS NULL OR total_iva >= 0)
      AND (total_final IS NULL OR total_final >= 0)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
