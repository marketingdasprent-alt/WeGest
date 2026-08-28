-- Map all unmapped Rajwinder Singh viagens to his motorista_id
UPDATE bolt_viagens 
SET motorista_id = '428849ad-a8b3-4f50-8c67-2f199bf18960'
WHERE driver_uuid = '6ec095bd-6036-47de-b5e4-4add5684818a' 
AND motorista_id IS NULL;

-- Also map all OTHER unmapped bolt_viagens where driver_uuid has a known mapping
UPDATE bolt_viagens bv
SET motorista_id = bm.motorista_id
FROM bolt_mapeamento_motoristas bm
WHERE bv.driver_uuid = bm.driver_uuid
AND bv.motorista_id IS NULL
AND bm.motorista_id IS NOT NULL;