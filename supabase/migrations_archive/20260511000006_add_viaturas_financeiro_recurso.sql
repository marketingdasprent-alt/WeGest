INSERT INTO recursos (nome, categoria, descricao)
VALUES ('viaturas_financeiro', 'Viaturas', 'Ver dados financeiros das viaturas (rendas, custos, etc.)')
ON CONFLICT (nome) DO NOTHING;
