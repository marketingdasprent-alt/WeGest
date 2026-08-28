-- Corrigir o problema do espaço extra no nome da Ana Silva
UPDATE profiles 
SET nome = 'Ana Silva'
WHERE nome = 'Ana Silva ';

-- Também verificar se há leads com o nome antigo e corrigir
UPDATE leads_dasprent 
SET gestor_responsavel = 'Ana Silva'
WHERE gestor_responsavel = 'Ana Silva ';

-- Verificar se existem outras variações do nome Ana
UPDATE leads_dasprent 
SET gestor_responsavel = 'Ana Silva'
WHERE gestor_responsavel LIKE 'Ana Alexandra Marques da Silva%';