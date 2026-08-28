-- Backfill uber_transactions.motorista_id from uber_drivers (matched by fuzzy name previously)
UPDATE uber_transactions ut
SET motorista_id = ud.motorista_id
FROM uber_drivers ud
WHERE ut.uber_driver_id = ud.uber_driver_id
  AND ut.integracao_id = ud.integracao_id
  AND ud.motorista_id IS NOT NULL
  AND ut.motorista_id IS NULL;

-- Trigger: when uber_drivers.motorista_id is set (now or in future),
-- propagate to all matching uber_transactions automatically.
CREATE OR REPLACE FUNCTION sync_motorista_id_to_transactions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.motorista_id IS NOT NULL AND (OLD.motorista_id IS NULL OR OLD.motorista_id <> NEW.motorista_id) THEN
    UPDATE uber_transactions
    SET motorista_id = NEW.motorista_id
    WHERE uber_driver_id = NEW.uber_driver_id
      AND integracao_id = NEW.integracao_id
      AND (motorista_id IS NULL OR motorista_id <> NEW.motorista_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_motorista_to_transactions ON uber_drivers;
CREATE TRIGGER trigger_sync_motorista_to_transactions
AFTER INSERT OR UPDATE OF motorista_id ON uber_drivers
FOR EACH ROW EXECUTE FUNCTION sync_motorista_id_to_transactions();
