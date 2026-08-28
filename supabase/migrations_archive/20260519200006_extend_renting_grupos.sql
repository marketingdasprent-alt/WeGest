-- ============================================================
-- Estender renting_grupos com campos de configuração
-- (inspirado em sistemas de rent-a-car como AnyRent)
-- ============================================================

ALTER TABLE public.renting_grupos
  ADD COLUMN IF NOT EXISTS codigo_sipp          text,
  ADD COLUMN IF NOT EXISTS idade_minima_condutor integer CHECK (idade_minima_condutor >= 16),
  ADD COLUMN IF NOT EXISTS idade_maxima_condutor integer CHECK (idade_maxima_condutor >= 16),
  ADD COLUMN IF NOT EXISTS combustivel          text
    CHECK (combustivel IN ('gasolina','diesel','hibrido','eletrico','gpl','outro')),
  ADD COLUMN IF NOT EXISTS capacidade_deposito  integer CHECK (capacidade_deposito >= 0),
  ADD COLUMN IF NOT EXISTS mapa_danos_url       text,
  ADD COLUMN IF NOT EXISTS mapa_danos_verso_url text,
  ADD COLUMN IF NOT EXISTS isento_iva           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reserva_min_minutos  integer CHECK (reserva_min_minutos > 0),
  ADD COLUMN IF NOT EXISTS reserva_max_minutos  integer CHECK (reserva_max_minutos > 0);

COMMENT ON COLUMN public.renting_grupos.codigo_sipp IS
  'Código SIPP (Standard Interline Passenger Procedures) — usado em webservices externos.';
COMMENT ON COLUMN public.renting_grupos.idade_minima_condutor IS
  'Idade mínima permitida para conduzir viaturas deste grupo. NULL = sem restrição.';
COMMENT ON COLUMN public.renting_grupos.idade_maxima_condutor IS
  'Idade máxima permitida para conduzir viaturas deste grupo. NULL = sem restrição.';
COMMENT ON COLUMN public.renting_grupos.combustivel IS
  'Tipo de combustível por defeito para viaturas deste grupo.';
COMMENT ON COLUMN public.renting_grupos.capacidade_deposito IS
  'Capacidade média do depósito em litros. Usado se o modelo não tiver valor específico.';
COMMENT ON COLUMN public.renting_grupos.mapa_danos_url IS
  'Imagem do mapa de danos (frente) para contratos deste grupo.';
COMMENT ON COLUMN public.renting_grupos.mapa_danos_verso_url IS
  'Imagem do mapa de danos (verso) para contratos deste grupo.';
COMMENT ON COLUMN public.renting_grupos.isento_iva IS
  'Se true, as tarifas deste grupo são isentas de IVA (cessões internas).';
COMMENT ON COLUMN public.renting_grupos.reserva_min_minutos IS
  'Tempo mínimo de reserva permitido em minutos. NULL = sem restrição.';
COMMENT ON COLUMN public.renting_grupos.reserva_max_minutos IS
  'Tempo máximo de reserva permitido em minutos. NULL = sem restrição.';
