-- Eliminar motoristas duplicados 88 e 89
DELETE FROM motoristas_ativos 
WHERE codigo IN (88, 89);