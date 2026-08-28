ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS checkout_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkin_pendente boolean NOT NULL DEFAULT false;
