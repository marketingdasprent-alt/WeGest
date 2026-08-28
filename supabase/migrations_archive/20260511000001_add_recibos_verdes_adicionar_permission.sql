-- Adicionar permissão para colaboradores adicionarem recibos verdes manualmente
INSERT INTO recursos (nome, categoria, descricao)
VALUES ('recibos_verdes_adicionar', 'Financeiro', 'Adicionar recibos verdes manualmente em nome do motorista')
ON CONFLICT (nome) DO NOTHING;
