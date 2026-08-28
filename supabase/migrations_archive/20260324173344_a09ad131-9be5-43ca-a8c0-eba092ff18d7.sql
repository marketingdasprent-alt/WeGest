UPDATE plataformas_configuracao
SET robot_target_platform = CASE
  WHEN lower(nome) LIKE 'bolt%' THEN 'bolt'
  WHEN lower(nome) LIKE 'uber%' THEN 'uber'
  WHEN lower(nome) LIKE 'bp%' THEN 'bp'
END
WHERE plataforma = 'robot' AND robot_target_platform IS NULL;