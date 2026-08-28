-- Corrigir cargos com espaços em branco
UPDATE profiles 
SET cargo = TRIM(cargo) 
WHERE cargo IS NOT NULL AND cargo != TRIM(cargo);