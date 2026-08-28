-- KM e combustivel no momento do checkout/checkin
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS km_checkout INTEGER;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS km_checkin INTEGER;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS combustivel_checkout TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS combustivel_checkin TEXT;

-- Ligar fotos de danos ao contrato onde foram detectadas
ALTER TABLE viatura_dano_fotos ADD COLUMN IF NOT EXISTS contrato_id UUID REFERENCES contratos(id) ON DELETE SET NULL;
ALTER TABLE viatura_danos ADD COLUMN IF NOT EXISTS contrato_id_origem UUID REFERENCES contratos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_viatura_dano_fotos_contrato ON viatura_dano_fotos(contrato_id);
CREATE INDEX IF NOT EXISTS idx_viatura_danos_contrato_origem ON viatura_danos(contrato_id_origem);
