-- Map all newly synced Rajwinder viagens
UPDATE bolt_viagens 
SET motorista_id = '428849ad-a8b3-4f50-8c67-2f199bf18960'
WHERE driver_uuid = '6ec095bd-6036-47de-b5e4-4add5684818a' 
AND motorista_id IS NULL;