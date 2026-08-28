-- Corrigir dados inconsistentes de cargo para Thais Lorraine e Rafaela Ramos

-- 1. Corrigir Thais Lorraine (campo texto "cargo" está errado)
UPDATE profiles 
SET cargo = 'Gestor Documental' 
WHERE id = 'd83b72bd-33e8-4df9-bc61-2cdb58dbb606';

-- 2. Corrigir Rafaela Ramos (atribuir cargo_id de Gestor Documental)
UPDATE profiles 
SET cargo_id = 'b128ef5c-49a2-4178-9e65-32c1c04a62b5',
    cargo = 'Gestor Documental'
WHERE id = 'a9e417b2-41ee-48a1-ab22-f30e26ea6525';