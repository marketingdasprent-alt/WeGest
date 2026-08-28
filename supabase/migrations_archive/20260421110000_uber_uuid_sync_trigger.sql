-- Garantir que a coluna existe na tabela base (a migration anterior usou motoristas_ativos view)
ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS uber_uuid TEXT;
ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS bolt_id TEXT;

CREATE INDEX IF NOT EXISTS idx_motoristas_uber_uuid ON motoristas(uber_uuid);
CREATE INDEX IF NOT EXISTS idx_motoristas_bolt_id ON motoristas(bolt_id);

-- Trigger: quando uber_drivers.motorista_id é definido,
-- escreve uber_driver_id em motoristas.uber_uuid automaticamente.

CREATE OR REPLACE FUNCTION sync_uber_uuid_to_motorista()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.motorista_id IS NOT NULL AND NEW.uber_driver_id IS NOT NULL THEN
    UPDATE motoristas
    SET uber_uuid = NEW.uber_driver_id
    WHERE id = NEW.motorista_id
      AND (uber_uuid IS NULL OR uber_uuid <> NEW.uber_driver_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_uber_uuid ON uber_drivers;
CREATE TRIGGER trigger_sync_uber_uuid
AFTER INSERT OR UPDATE OF motorista_id ON uber_drivers
FOR EACH ROW EXECUTE FUNCTION sync_uber_uuid_to_motorista();

-- Retroativo: sincroniza registos existentes onde motorista_id já está definido
UPDATE motoristas m
SET uber_uuid = ud.uber_driver_id
FROM uber_drivers ud
WHERE ud.motorista_id = m.id
  AND ud.uber_driver_id IS NOT NULL
  AND (m.uber_uuid IS NULL OR m.uber_uuid <> ud.uber_driver_id);
