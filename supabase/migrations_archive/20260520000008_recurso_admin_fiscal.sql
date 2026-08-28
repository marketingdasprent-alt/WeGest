-- ============================================================
-- Recurso de permissão para a tab Fiscal
-- ============================================================
-- A matriz de permissões dos grupos é alimentada pela tabela
-- `recursos`. Este recurso faz a tab "Fiscal" (definições de IVA)
-- aparecer na categoria Administração — a par de "Configurações
-- do sistema", "Gerir utilizadores", etc. — com os controlos
-- Nenhum / Ver / Editar por cargo.
-- ============================================================
INSERT INTO public.recursos (nome, categoria, descricao)
VALUES ('admin_fiscal', 'Administração', 'Gerir definições fiscais (IVA)')
ON CONFLICT (nome) DO NOTHING;
