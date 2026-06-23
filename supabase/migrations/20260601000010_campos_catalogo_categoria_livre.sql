-- ============================================================
-- Campos do catálogo — permitir categorias novas (criadas pelo provider)
-- ============================================================
-- Até aqui a categoria estava limitada às 4 base por um CHECK. O provider
-- passa a poder criar categorias próprias, por isso a coluna aceita texto
-- livre (continua NOT NULL).
-- Idempotente.
-- ============================================================

ALTER TABLE public.campos_catalogo
  DROP CONSTRAINT IF EXISTS campos_catalogo_categoria_chk;
