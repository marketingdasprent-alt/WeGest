-- Adicionar recurso para o módulo Financeiro
INSERT INTO public.recursos (nome, descricao, categoria)
VALUES ('financeiro_recibos', 'Gestão de recibos verdes dos motoristas', 'Financeiro')
ON CONFLICT (nome) DO NOTHING;