
-- Deletar leads duplicados (mantendo o primeiro de cada grupo criado no mesmo minuto)
DELETE FROM leads_dasprent
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      email,
      created_at,
      ROW_NUMBER() OVER (
        PARTITION BY email, DATE_TRUNC('minute', created_at) 
        ORDER BY created_at ASC
      ) as rn
    FROM leads_dasprent
  ) subquery
  WHERE rn > 1
);
