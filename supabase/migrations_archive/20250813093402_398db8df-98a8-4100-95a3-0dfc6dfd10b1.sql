-- Atualizar formulários existentes para garantir que todos tenham o campo de formação TVDE

-- Atualizar o formulário "Formulário TVDE Distância Arrojada" 
UPDATE formularios 
SET campos = jsonb_set(
  jsonb_set(
    campos - 3, -- Remove o antigo campo de licença TVDE (índice 3)
    '{3}',
    '{"id": "field_tem_formacao_tvde", "type": "radio", "label": "Tem Licença TVDE?", "required": true, "options": ["Sim", "Não"]}'::jsonb
  ),
  '{updated_at}',
  to_jsonb(now())
)
WHERE nome = 'Formulário TVDE Distância Arrojada';

-- Atualizar o formulário "Formação TVDE"
UPDATE formularios 
SET campos = jsonb_set(
  jsonb_set(
    -- Remover o campo atual de licença TVDE e adicionar o padronizado
    (campos #- '{4}'), -- Remove último elemento (campo atual)
    '{4}',
    '{"id": "field_tem_formacao_tvde", "type": "radio", "label": "Tem Licença TVDE?", "required": true, "options": ["Sim", "Não"]}'::jsonb
  ),
  '{updated_at}',
  to_jsonb(now())
)
WHERE nome = 'Formação TVDE';