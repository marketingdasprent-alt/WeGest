-- Adiciona recurso de permissão para editar a data do 1.º contrato de um motorista
INSERT INTO public.recursos (nome, descricao, categoria)
VALUES (
  'motoristas_editar_data_contrato',
  'Editar a data do 1.º contrato de um motorista',
  'Motoristas'
)
ON CONFLICT (nome) DO NOTHING;
