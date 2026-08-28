
-- One-time fix: Create motorista_viaturas associations from bolt_viagens data
-- and update viaturas status to 'em_uso'

-- Step 1: Insert missing associations (most recent driver per vehicle from last 30 days)
WITH latest_pairs AS (
  SELECT DISTINCT ON (bv_veh.viatura_id)
    bd.motorista_id,
    bv_veh.viatura_id,
    v.order_created_timestamp
  FROM bolt_viagens v
  JOIN bolt_drivers bd ON bd.driver_uuid = v.driver_uuid AND bd.motorista_id IS NOT NULL
  JOIN bolt_vehicles bv_veh ON UPPER(REPLACE(REPLACE(bv_veh.license_plate, '-', ''), ' ', '')) = UPPER(REPLACE(REPLACE(v.vehicle_license_plate, '-', ''), ' ', '')) AND bv_veh.viatura_id IS NOT NULL
  WHERE v.order_created_timestamp >= NOW() - INTERVAL '30 days'
  ORDER BY bv_veh.viatura_id, v.order_created_timestamp DESC
)
INSERT INTO motorista_viaturas (motorista_id, viatura_id, data_inicio, status, observacoes)
SELECT 
  lp.motorista_id,
  lp.viatura_id,
  CURRENT_DATE,
  'ativo',
  'Criado automaticamente - reconstrução de associações a partir de viagens Bolt'
FROM latest_pairs lp
WHERE NOT EXISTS (
  SELECT 1 FROM motorista_viaturas mv 
  WHERE mv.motorista_id = lp.motorista_id 
    AND mv.viatura_id = lp.viatura_id 
    AND mv.data_fim IS NULL
);

-- Step 2: Update status of all associated viaturas to 'em_uso'
UPDATE viaturas 
SET status = 'em_uso'
WHERE id IN (
  SELECT DISTINCT viatura_id 
  FROM motorista_viaturas 
  WHERE data_fim IS NULL AND status = 'ativo'
)
AND status = 'disponivel';
