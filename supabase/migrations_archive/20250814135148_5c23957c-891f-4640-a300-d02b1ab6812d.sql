-- Criar as novas policies RLS para leads_dasprent
CREATE POLICY "Admins podem gerenciar todos os leads" 
ON leads_dasprent FOR ALL 
USING (is_current_user_admin())
WITH CHECK (is_current_user_admin());

-- Gestores podem ver leads não atribuídos + seus próprios leads
CREATE POLICY "Gestores podem ver leads disponíveis e próprios" 
ON leads_dasprent FOR SELECT 
USING (
  -- Admins veem tudo (já coberto pela policy de admin acima)
  is_current_user_admin() OR
  -- Gestores TVDE podem ver leads não atribuídos
  (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND cargo = 'Gestor TVDE') 
    AND (gestor_responsavel IS NULL OR gestor_responsavel = '')
  ) OR
  -- Gestores podem ver seus próprios leads
  (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.nome = gestor_responsavel)
  )
);

-- Qualquer um pode criar leads (formulários públicos)
CREATE POLICY "Qualquer um pode criar leads" 
ON leads_dasprent FOR INSERT 
WITH CHECK (true);

-- Gestores podem atualizar apenas seus próprios leads + admins podem atualizar todos
CREATE POLICY "Gestores podem atualizar seus leads" 
ON leads_dasprent FOR UPDATE 
USING (
  is_current_user_admin() OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.nome = gestor_responsavel)
)
WITH CHECK (
  is_current_user_admin() OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.nome = gestor_responsavel)
);

-- Apenas admins podem deletar leads
CREATE POLICY "Apenas admins podem deletar leads" 
ON leads_dasprent FOR DELETE 
USING (is_current_user_admin());