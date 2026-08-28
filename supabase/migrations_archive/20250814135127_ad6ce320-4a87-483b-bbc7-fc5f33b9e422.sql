-- Remover todas as policies existentes
DROP POLICY IF EXISTS "Admins podem manage leads" ON leads_dasprent;
DROP POLICY IF EXISTS "Anyone can create leads" ON leads_dasprent;
DROP POLICY IF EXISTS "Todos podem atualizar leads" ON leads_dasprent;
DROP POLICY IF EXISTS "Todos podem criar leads" ON leads_dasprent;
DROP POLICY IF EXISTS "Todos podem deletar leads" ON leads_dasprent;
DROP POLICY IF EXISTS "Todos podem visualizar leads" ON leads_dasprent;
DROP POLICY IF EXISTS "Admins podem gerenciar todos os leads" ON leads_dasprent;
DROP POLICY IF EXISTS "Gestores podem ver leads disponíveis e próprios" ON leads_dasprent;
DROP POLICY IF EXISTS "Qualquer um pode criar leads" ON leads_dasprent;
DROP POLICY IF EXISTS "Gestores podem atualizar seus leads" ON leads_dasprent;
DROP POLICY IF EXISTS "Apenas admins podem deletar leads" ON leads_dasprent;

-- Criar função para atribuição automática de lead ao primeiro gestor que visualizar
CREATE OR REPLACE FUNCTION public.assign_lead_on_first_view(lead_id_param UUID, user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_name TEXT;
  lead_current_gestor TEXT;
BEGIN
  -- Buscar o nome do usuário
  SELECT nome INTO user_name 
  FROM profiles 
  WHERE id = user_id_param AND cargo = 'Gestor TVDE';
  
  -- Se não encontrou o usuário ou não é gestor TVDE, retornar false
  IF user_name IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Buscar o gestor atual do lead
  SELECT gestor_responsavel INTO lead_current_gestor 
  FROM leads_dasprent 
  WHERE id = lead_id_param;
  
  -- Se o lead não existe, retornar false
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Se o lead já tem gestor atribuído, retornar false (não pode reatribuir)
  IF lead_current_gestor IS NOT NULL AND lead_current_gestor != '' THEN
    RETURN FALSE;
  END IF;
  
  -- Atribuir o lead ao gestor
  UPDATE leads_dasprent 
  SET gestor_responsavel = user_name 
  WHERE id = lead_id_param 
    AND (gestor_responsavel IS NULL OR gestor_responsavel = '');
  
  -- Verificar se foi atualizado
  IF FOUND THEN
    -- Registrar no histórico
    INSERT INTO lead_status_history (lead_id, status_anterior, status_novo, alterado_por, observacoes)
    VALUES (lead_id_param, 'novo', 'visualizado', user_id_param, 'Lead atribuído automaticamente na primeira visualização');
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;