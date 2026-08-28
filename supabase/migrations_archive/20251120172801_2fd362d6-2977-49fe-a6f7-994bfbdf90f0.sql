-- Corrigir políticas RLS para cargo_permissoes e recursos
-- Problema: Políticas TO public podem não funcionar corretamente para usuários autenticados

-- 1. CARGO_PERMISSOES: Remover política antiga e criar nova para authenticated
DROP POLICY IF EXISTS "Todos podem ver permissões" ON cargo_permissoes;

CREATE POLICY "Authenticated users can view permissoes" ON cargo_permissoes
FOR SELECT 
TO authenticated
USING (true);

-- 2. RECURSOS: Remover política antiga e criar nova para authenticated
DROP POLICY IF EXISTS "Todos podem ver recursos" ON recursos;

CREATE POLICY "Authenticated users can view recursos" ON recursos
FOR SELECT 
TO authenticated
USING (true);