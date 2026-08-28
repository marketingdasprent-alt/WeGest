-- Remover política de SELECT que causa recursão circular
DROP POLICY IF EXISTS "Permissão para ver perfis" ON profiles;

-- Criar nova política simples que permite leitura para todos autenticados
-- Isso é seguro porque as políticas de UPDATE já protegem contra edições não autorizadas
CREATE POLICY "Users can view all profiles" ON profiles
FOR SELECT 
TO authenticated
USING (true);