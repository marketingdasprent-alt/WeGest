-- ============================================================
-- Migration: adicionar género e morada à tabela clientes
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.genero_enum AS ENUM ('M', 'F', 'Outro');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS genero public.genero_enum,
  ADD COLUMN IF NOT EXISTS morada VARCHAR(255);

-- Index opcional: filtrar/listar por género
CREATE INDEX IF NOT EXISTS idx_clientes_genero ON public.clientes(genero)
  WHERE genero IS NOT NULL;
