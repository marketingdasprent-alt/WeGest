-- ============================================================
-- Reservas — campos adicionais ao estilo AnyRent
-- ============================================================
-- Acrescenta campos para suportar:
--   • Aluguer de longa duração com renovação periódica (UI; a
--     lógica de geração automática de contratos subsequentes
--     será implementada em fase posterior).
--   • Valores financeiros explícitos: franquia, caução, kms
--     incluídos e custo por km adicional.
--   • Distinção entre observações públicas (apresentadas no
--     relatório/contrato) e observações internas (uso interno).
-- ============================================================

ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS aluguer_longa_duracao    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renovacao_opcao          text,
  ADD COLUMN IF NOT EXISTS renovacao_intervalo_dias integer,
  ADD COLUMN IF NOT EXISTS franquia_valor           numeric(10,2),
  ADD COLUMN IF NOT EXISTS caucao_valor             numeric(10,2),
  ADD COLUMN IF NOT EXISTS kms_incluidos            integer,
  ADD COLUMN IF NOT EXISTS km_adicional_valor       numeric(10,4),
  ADD COLUMN IF NOT EXISTS observacoes_internas     text;

-- Constraint: opção de renovação só válida quando longa duração activa
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_renovacao_opcao_valida'
  ) THEN
    ALTER TABLE public.reservas
      ADD CONSTRAINT reservas_renovacao_opcao_valida
      CHECK (
        renovacao_opcao IS NULL
        OR renovacao_opcao IN ('primeiro_dia_mes', 'mesmo_dia_cada_mes', 'intervalo_dias')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_renovacao_intervalo_positivo'
  ) THEN
    ALTER TABLE public.reservas
      ADD CONSTRAINT reservas_renovacao_intervalo_positivo
      CHECK (renovacao_intervalo_dias IS NULL OR renovacao_intervalo_dias > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_kms_incluidos_nao_negativos'
  ) THEN
    ALTER TABLE public.reservas
      ADD CONSTRAINT reservas_kms_incluidos_nao_negativos
      CHECK (kms_incluidos IS NULL OR kms_incluidos >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_valores_nao_negativos'
  ) THEN
    ALTER TABLE public.reservas
      ADD CONSTRAINT reservas_valores_nao_negativos
      CHECK (
        (franquia_valor      IS NULL OR franquia_valor      >= 0)
        AND (caucao_valor    IS NULL OR caucao_valor        >= 0)
        AND (km_adicional_valor IS NULL OR km_adicional_valor >= 0)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.reservas.aluguer_longa_duracao IS
  'Quando true, indica que a reserva representa um aluguer de longa duração com renovação periódica.';
COMMENT ON COLUMN public.reservas.renovacao_opcao IS
  'Periodicidade de renovação: primeiro_dia_mes | mesmo_dia_cada_mes | intervalo_dias.';
COMMENT ON COLUMN public.reservas.renovacao_intervalo_dias IS
  'Nº de dias entre renovações quando renovacao_opcao = intervalo_dias.';
COMMENT ON COLUMN public.reservas.kms_incluidos IS
  'Nº de kms incluídos no contrato. NULL = ilimitado.';
COMMENT ON COLUMN public.reservas.km_adicional_valor IS
  'Custo por km acima do limite de kms_incluidos (em €/km).';
COMMENT ON COLUMN public.reservas.observacoes_internas IS
  'Observações internas — não aparecem no relatório/contrato apresentado ao cliente.';
