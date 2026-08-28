-- Corrigir motorista existente que foi aprovado sem user_id
UPDATE motoristas_ativos ma
SET user_id = mc.user_id
FROM motorista_candidaturas mc
WHERE ma.email = mc.email
  AND ma.user_id IS NULL
  AND mc.user_id IS NOT NULL;