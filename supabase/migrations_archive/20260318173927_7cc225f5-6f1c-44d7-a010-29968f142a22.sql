UPDATE uber_transactions 
SET uber_transaction_id = replace(uber_transaction_id, '-20260309-20260316', '-20260309-20260315')
WHERE uber_transaction_id LIKE '%-20260309-20260316%';