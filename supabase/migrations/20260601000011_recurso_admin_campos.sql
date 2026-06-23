-- ============================================================
-- Recurso de permissão: Gerir campos dinâmicos (catálogo)
-- ============================================================
-- Aparece na categoria Administração do editor de permissões. Controla
-- quem pode gerir o catálogo de campos dinâmicos dos templates.
-- A escrita na tabela campos_catalogo continua limitada por RLS à org
-- provider (Década Ousada) — esta permissão é o controlo de acesso na UI.
-- Idempotente.
-- ============================================================

INSERT INTO public.recursos (nome, categoria, descricao)
VALUES (
  'admin_campos_dinamicos',
  'Administração',
  'Gerir campos dinâmicos dos templates (catálogo)'
)
ON CONFLICT (nome) DO NOTHING;
