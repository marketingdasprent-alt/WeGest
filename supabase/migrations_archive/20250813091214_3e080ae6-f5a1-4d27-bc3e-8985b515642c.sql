-- Atualizar formulário "Formação TVDE" para incluir campo de licença TVDE obrigatório
UPDATE formularios 
SET campos = jsonb_insert(
  campos,
  '{3}',
  '{
    "id": "field_tvde_licenca",
    "label": "Tem Licença TVDE?",
    "type": "select",
    "required": true,
    "options": ["Sim", "Não"]
  }'::jsonb,
  true
)
WHERE nome = 'Formação TVDE';

-- Atualizar formulário "Teste" para incluir campos necessários
UPDATE formularios 
SET campos = '[
  {
    "id": "field_teste_nome",
    "label": "Nome",
    "type": "text",
    "required": true
  },
  {
    "id": "field_teste_email",
    "label": "Email",
    "type": "email",
    "required": true
  },
  {
    "id": "field_teste_telefone",
    "label": "WhatsApp",
    "type": "tel",
    "required": true
  },
  {
    "id": "field_teste_tvde_licenca",
    "label": "Tem Licença TVDE?",
    "type": "select",
    "required": true,
    "options": ["Sim", "Não"]
  },
  {
    "id": "field_teste_observacoes",
    "label": "Observações",
    "type": "textarea",
    "required": false
  }
]'::jsonb
WHERE nome = 'Teste';