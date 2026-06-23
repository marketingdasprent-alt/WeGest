-- ============================================================
-- Campos dinâmicos de templates — customização por organização
-- ============================================================
-- A paleta de "Campos Dinâmicos" do editor de templates era hardcoded e
-- global. Cada org passa a poder escolher QUAIS campos aparecem, a sua
-- ORDEM e o RÓTULO mostrado — SEM alterar a chave canónica (a resolução
-- do PDF continua igual; o chip insere sempre {{chave}}).
--
-- Guarda apenas OVERRIDES por org. Sem linhas → fail-open (catálogo todo
-- visível, ordem/rótulos default — ver src/lib/camposDinamicos.ts).
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.org_campos_dinamicos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE
               DEFAULT public.get_current_org_id(),
  chave      text NOT NULL,                       -- chave canónica do catálogo
  label      text,                                -- rótulo custom (NULL = default)
  ordem      integer NOT NULL DEFAULT 0,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_campos_dinamicos_unq UNIQUE (org_id, chave)
);

CREATE INDEX IF NOT EXISTS idx_org_campos_dinamicos_org
  ON public.org_campos_dinamicos(org_id);

-- updated_at automático (reusa o trigger genérico, se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace
  ) THEN
    DROP TRIGGER IF EXISTS trg_org_campos_dinamicos_updated ON public.org_campos_dinamicos;
    CREATE TRIGGER trg_org_campos_dinamicos_updated
      BEFORE UPDATE ON public.org_campos_dinamicos
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── RLS: isolamento multi-tenant (padrão rls_org_isolation) ──
ALTER TABLE public.org_campos_dinamicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_org_isolation ON public.org_campos_dinamicos;
CREATE POLICY rls_org_isolation ON public.org_campos_dinamicos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id());

-- Política permissiva: gestão restrita a admin; leitura a quem acede ao admin
-- de documentos. (Combina com a RESTRICTIVE acima — ambas têm de passar.)
DROP POLICY IF EXISTS org_campos_dinamicos_select ON public.org_campos_dinamicos;
CREATE POLICY org_campos_dinamicos_select ON public.org_campos_dinamicos
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS org_campos_dinamicos_manage ON public.org_campos_dinamicos;
CREATE POLICY org_campos_dinamicos_manage ON public.org_campos_dinamicos
  FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

COMMENT ON TABLE public.org_campos_dinamicos IS
  'Overrides por org da paleta de campos dinâmicos de templates (visível/ordem/rótulo). Catálogo de chaves em src/lib/camposDinamicos.ts.';
