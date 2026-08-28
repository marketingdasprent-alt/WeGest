INSERT INTO recursos (nome, categoria, descricao)
VALUES ('calendario_recolhas', 'Calendário', 'Aceder ao painel de recolhas pendentes de check-in')
ON CONFLICT (nome) DO NOTHING;
