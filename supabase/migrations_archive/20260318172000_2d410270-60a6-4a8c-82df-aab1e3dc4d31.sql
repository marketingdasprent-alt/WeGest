
-- Fix existing uber_transactions with null periodo
-- Records created on 2026-03-18 are from the week of 2026-03-10 to 2026-03-16
UPDATE uber_transactions 
SET raw_transaction = jsonb_set(
  COALESCE(raw_transaction::jsonb, '{}'::jsonb), 
  '{periodo}', 
  '"20260310-20260316"'
)
WHERE raw_transaction->>'periodo' IS NULL 
   OR raw_transaction->>'periodo' = '';

-- Also fix uber_atividade_motoristas with empty periodo
UPDATE uber_atividade_motoristas
SET periodo = '20260310-20260316'
WHERE periodo IS NULL OR periodo = '';
