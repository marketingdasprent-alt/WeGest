-- Nível de eletricidade e GPL para checkin/checkout de contratos
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS eletricidade_checkout TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS eletricidade_checkin TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS gpl_checkout TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS gpl_checkin TEXT;
