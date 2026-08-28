-- Corrigir todas as viaturas importadas da Bolt
UPDATE viaturas
SET 
  -- Formatar matrícula como XX-XX-XX
  matricula = CONCAT(
    SUBSTRING(UPPER(REPLACE(REPLACE(matricula, '-', ''), ' ', '')), 1, 2), '-',
    SUBSTRING(UPPER(REPLACE(REPLACE(matricula, '-', ''), ' ', '')), 3, 2), '-',
    SUBSTRING(UPPER(REPLACE(REPLACE(matricula, '-', ''), ' ', '')), 5, 2)
  ),
  -- Extrair marca (primeira palavra do modelo)
  marca = SPLIT_PART(modelo, ' ', 1),
  -- Extrair modelo (resto após a marca)
  modelo = CASE 
    WHEN POSITION(' ' IN modelo) > 0 THEN TRIM(SUBSTRING(modelo FROM POSITION(' ' IN modelo) + 1))
    ELSE modelo
  END,
  -- Traduzir cor para português
  cor = CASE LOWER(cor)
    WHEN 'black' THEN 'Preto'
    WHEN 'white' THEN 'Branco'
    WHEN 'gray' THEN 'Cinza'
    WHEN 'grey' THEN 'Cinza'
    WHEN 'silver' THEN 'Prata'
    WHEN 'red' THEN 'Vermelho'
    WHEN 'blue' THEN 'Azul'
    WHEN 'green' THEN 'Verde'
    WHEN 'yellow' THEN 'Amarelo'
    WHEN 'brown' THEN 'Castanho'
    WHEN 'beige' THEN 'Bege'
    WHEN 'gold' THEN 'Dourado'
    WHEN 'purple' THEN 'Roxo'
    WHEN 'pink' THEN 'Rosa'
    ELSE cor
  END
WHERE observacoes LIKE '%Criada automaticamente via sincronização Bolt%';