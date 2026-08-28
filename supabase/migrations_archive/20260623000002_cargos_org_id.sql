-- ============================================================
-- Fix: cargos deve ter org_id (multitenant)
-- ============================================================
-- Problema: tabela cargos tem UNIQUE(nome) globalmente,
-- impossibilitando "Administrador" em múltiplas orgs.
-- Solução: adicionar org_id e mudar para UNIQUE(nome, org_id).
-- ============================================================

-- 1. Adicionar coluna org_id
ALTER TABLE public.cargos
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizacoes(id) ON DELETE CASCADE;

-- 2. Remover constraint UNIQUE global
ALTER TABLE public.cargos
  DROP CONSTRAINT IF EXISTS cargos_nome_key;

-- 3. Adicionar índice UNIQUE composto (nome, org_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cargos_nome_org_id
  ON public.cargos(nome, org_id)
  WHERE org_id IS NOT NULL;

-- 4. Adicionar RLS
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cargos_org_isolation" ON public.cargos;
CREATE POLICY "cargos_org_isolation" ON public.cargos
  FOR ALL TO authenticated
  USING (org_id = get_current_org_id())
  WITH CHECK (org_id = get_current_org_id());

-- 5. Índice para busca por org
CREATE INDEX IF NOT EXISTS idx_cargos_org_id ON public.cargos(org_id);
