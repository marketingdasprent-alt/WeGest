
-- Fix uber_transactions: correct period from 20260310-20260316 to 20260309-20260315
-- and occurred_at from 2026-03-10 back to 2026-03-09 (the actual Monday)
UPDATE uber_transactions 
SET 
  occurred_at = '2026-03-09T12:00:00+00',
  raw_transaction = jsonb_set(
    raw_transaction::jsonb, 
    '{periodo}', 
    '"20260309-20260315"'
  ),
  uber_transaction_id = replace(uber_transaction_id, '20260310-20260316', '20260309-20260315')
WHERE raw_transaction->>'periodo' = '20260310-20260316';

-- Fix uber_atividade_motoristas: correct period
UPDATE uber_atividade_motoristas 
SET periodo = '20260309-20260315'
WHERE periodo = '20260310-20260316';
