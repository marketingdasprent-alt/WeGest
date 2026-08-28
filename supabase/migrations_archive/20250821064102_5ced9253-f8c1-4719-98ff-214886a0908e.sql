-- Remove auto-assignment for admins, keep only for Gestor TVDE users
CREATE OR REPLACE FUNCTION public.assign_lead_on_first_view(lead_id_param uuid, user_id_param uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_name TEXT;
  user_cargo TEXT;
  lead_current_gestor TEXT;
BEGIN
  -- Buscar informações do usuário
  SELECT nome, cargo INTO user_name, user_cargo 
  FROM profiles 
  WHERE id = user_id_param;
  
  -- Se não encontrou o usuário/nome ou não é gestor TVDE, retornar false
  IF user_name IS NULL OR user_cargo != 'Gestor TVDE' THEN
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
  
  -- Atribuir o lead apenas ao gestor TVDE que visualizou primeiro
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
$function$;