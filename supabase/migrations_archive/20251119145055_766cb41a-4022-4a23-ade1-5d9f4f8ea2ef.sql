-- Corrigir datas dos contratos existentes para corresponder à data_contratacao do motorista
UPDATE contratos c
SET 
  data_inicio = ma.data_contratacao,
  data_assinatura = ma.data_contratacao,
  atualizado_em = now()
FROM motoristas_ativos ma
WHERE c.motorista_id = ma.id
  AND ma.data_contratacao IS NOT NULL
  AND (c.data_inicio != ma.data_contratacao OR c.data_assinatura != ma.data_contratacao);