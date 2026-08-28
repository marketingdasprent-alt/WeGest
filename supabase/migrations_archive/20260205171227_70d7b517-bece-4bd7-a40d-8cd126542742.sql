-- Corrigir matrículas em bolt_vehicles a partir do dados_raw
UPDATE bolt_vehicles 
SET license_plate = dados_raw->>'reg_number'
WHERE license_plate IS NULL 
  AND dados_raw->>'reg_number' IS NOT NULL;