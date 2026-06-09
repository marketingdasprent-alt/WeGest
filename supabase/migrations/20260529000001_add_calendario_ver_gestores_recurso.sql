INSERT INTO recursos (nome, categoria, descricao)
SELECT 'calendario_ver_gestores', 'Calendário', 'Ver gestores nos relatórios de eventos'
WHERE NOT EXISTS (
  SELECT 1 FROM recursos WHERE nome = 'calendario_ver_gestores'
);
