-- Sincronizar nomes de gestores com os nomes atualizados na tabela profiles

-- Primeiro, vamos verificar quais nomes precisam ser atualizados
-- Pedro Alexandre Costa montenegro -> Pedro Montenegro
UPDATE leads_dasprent 
SET gestor_responsavel = 'Pedro Montenegro'
WHERE gestor_responsavel = 'Pedro Alexandre Costa montenegro';

-- Ana Alexandra Marques da Silva  -> Ana Silva 
UPDATE leads_dasprent 
SET gestor_responsavel = 'Ana Silva'
WHERE gestor_responsavel = 'Ana Alexandra Marques da Silva ';

-- Juliana Souza da Silva -> Juliana Silva
UPDATE leads_dasprent 
SET gestor_responsavel = 'Juliana Silva'
WHERE gestor_responsavel = 'Juliana Souza da Silva';

-- Rafaela Ingrid Ribeiro Ramos -> Rafaela Ramos
UPDATE leads_dasprent 
SET gestor_responsavel = 'Rafaela Ramos'
WHERE gestor_responsavel = 'Rafaela Ingrid Ribeiro Ramos';

-- Criar função para sincronizar nomes automaticamente
CREATE OR REPLACE FUNCTION sync_gestor_names()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o nome foi alterado na tabela profiles, atualizar na tabela leads_dasprent
  IF OLD.nome IS DISTINCT FROM NEW.nome THEN
    UPDATE leads_dasprent 
    SET gestor_responsavel = NEW.nome
    WHERE gestor_responsavel = OLD.nome;
    
    RAISE NOTICE 'Atualizados gestores de % para %', OLD.nome, NEW.nome;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para sincronização automática
DROP TRIGGER IF EXISTS sync_gestor_names_trigger ON profiles;
CREATE TRIGGER sync_gestor_names_trigger
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_gestor_names();