-- Add extintor and contrato de prestação de serviço fields to motorista_viaturas
-- These are assigned to the driver at the moment they pick up the vehicle
ALTER TABLE public.motorista_viaturas
  ADD COLUMN IF NOT EXISTS extintor_numero TEXT,
  ADD COLUMN IF NOT EXISTS extintor_validade DATE,
  ADD COLUMN IF NOT EXISTS contrato_prestacao_assinatura DATE;
