-- Corrigir leads que o Pedro foi o primeiro a interagir mas não estão atribuídos a ele
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
UPDATE leads_dasprent 
SET gestor_responsavel = 'Pedro Montenegro'
FROM first_interactions fi
WHERE leads_dasprent.id = fi.lead_id
  AND fi.gestor_nome = 'Pedro Montenegro'
  AND (leads_dasprent.gestor_responsavel != 'Pedro Montenegro' OR leads_dasprent.gestor_responsavel IS NULL);

-- Verificar quantos leads o Pedro tem agora
SELECT COUNT(*) as pedro_leads_total FROM leads_dasprent WHERE gestor_responsavel = 'Pedro Montenegro';