-- Corrigir search_path das funções existentes
CREATE OR REPLACE FUNCTION assign_gestors_from_history()
RETURNS TABLE(lead_id uuid, gestor_nome text, first_interaction timestamp)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH first_interactions AS (
    SELECT DISTINCT ON (h.lead_id)
      h.lead_id,
      h.alterado_por,
      h.alterado_em,
      p.nome as gestor_nome
    FROM lead_status_history h
    LEFT JOIN profiles p ON h.alterado_por = p.id
    WHERE h.alterado_por IS NOT NULL 
      AND p.nome IS NOT NULL
    ORDER BY h.lead_id, h.alterado_em ASC
  )
  SELECT 
    fi.lead_id,
    fi.gestor_nome,
    fi.alterado_em as first_interaction
  FROM first_interactions fi
  JOIN leads_dasprent l ON fi.lead_id = l.id
  WHERE l.gestor_responsavel IS NULL OR l.gestor_responsavel = '';
$$;

CREATE OR REPLACE FUNCTION execute_gestor_assignment()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer := 0;
  assignment_record record;
BEGIN
  FOR assignment_record IN 
    SELECT * FROM assign_gestors_from_history()
  LOOP
    UPDATE leads_dasprent 
    SET gestor_responsavel = assignment_record.gestor_nome
    WHERE id = assignment_record.lead_id;
    
    updated_count := updated_count + 1;
  END LOOP;
  
  RETURN updated_count;
END;
$$;