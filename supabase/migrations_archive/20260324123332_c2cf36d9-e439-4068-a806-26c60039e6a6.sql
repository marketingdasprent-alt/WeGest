-- Insert bolt_driver for Rajwinder Singh
INSERT INTO bolt_drivers (driver_uuid, name, integracao_id, motorista_id)
VALUES ('6ec095bd-6036-47de-b5e4-4add5684818a', 'Rajwinder Singh', '4c4fbdcd-3c80-452f-b7b7-9cbdffd015a0', '428849ad-a8b3-4f50-8c67-2f199bf18960')
ON CONFLICT (driver_uuid) DO UPDATE SET motorista_id = '428849ad-a8b3-4f50-8c67-2f199bf18960';

-- Insert mapeamento
INSERT INTO bolt_mapeamento_motoristas (driver_uuid, driver_name, motorista_id, integracao_id, auto_mapped)
VALUES ('6ec095bd-6036-47de-b5e4-4add5684818a', 'Rajwinder Singh', '428849ad-a8b3-4f50-8c67-2f199bf18960', '4c4fbdcd-3c80-452f-b7b7-9cbdffd015a0', true)
ON CONFLICT (driver_uuid) DO UPDATE SET motorista_id = '428849ad-a8b3-4f50-8c67-2f199bf18960';

-- Update all Rajwinder's bolt_viagens to link to motorista
UPDATE bolt_viagens 
SET motorista_id = '428849ad-a8b3-4f50-8c67-2f199bf18960'
WHERE driver_uuid = '6ec095bd-6036-47de-b5e4-4add5684818a' 
AND motorista_id IS NULL;