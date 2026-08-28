
-- Criar bolt_drivers a partir das viagens (dados mais recentes por driver_uuid)
INSERT INTO bolt_drivers (driver_uuid, name, phone, integracao_id, status)
SELECT DISTINCT ON (driver_uuid) 
  driver_uuid, 
  driver_name, 
  driver_phone,
  integracao_id,
  'active'
FROM bolt_viagens 
WHERE driver_uuid IS NOT NULL
ORDER BY driver_uuid, order_created_timestamp DESC NULLS LAST
ON CONFLICT (driver_uuid) DO NOTHING;

-- Criar bolt_vehicles a partir das viagens (dados mais recentes por license_plate)
INSERT INTO bolt_vehicles (vehicle_uuid, license_plate, model, brand, integracao_id)
SELECT DISTINCT ON (vehicle_license_plate) 
  gen_random_uuid()::text,
  vehicle_license_plate,
  vehicle_model,
  split_part(vehicle_model, ' ', 1),
  integracao_id
FROM bolt_viagens 
WHERE vehicle_license_plate IS NOT NULL
ORDER BY vehicle_license_plate, order_created_timestamp DESC NULLS LAST
ON CONFLICT (vehicle_uuid) DO NOTHING;
