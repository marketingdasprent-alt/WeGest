-- ============================================================
-- Isolamento multi-tenant — clientes / documentos / cliente_documentos
-- ============================================================
-- PROBLEMA: estas três tabelas (criadas em 20260515000002) nasceram
-- ANTES da coluna org_id ser generalizada e ficaram fora da lista da
-- migration 20260513100003_add_org_id_to_all_tables. Como não têm
-- org_id, a política dinâmica RESTRICTIVE rls_org_isolation
-- (20260520000006) não as apanha. O RLS actual usa apenas
-- has_renting_access() — qualquer utilizador com acesso a renting vê
-- clientes e documentos de TODAS as organizações.
--
-- CORREÇÃO (alinha com reservas/contratos/movimentos):
--   1. Adiciona org_id uuid DEFAULT get_current_org_id().
--   2. Faz backfill dos registos existentes (deriva do criador e da
--      cadeia cliente_documentos → clientes; fallback p/ org única).
--   3. Aplica a política RESTRICTIVE rls_org_isolation a cada tabela
--      (a versão dinâmica já correu antes desta migration, por isso
--      tem de ser criada explicitamente aqui).
--   4. Corrige o índice único de documentos para ser por org.
--   5. Torna org_id NOT NULL — mas só se o backfill cobriu tudo, para
--      não bloquear o deploy com dados sujos (fail-safe: linhas com
--      org_id NULL já ficam invisíveis sob o RLS restritivo).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Coluna org_id + índice
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizacoes(id)
  DEFAULT public.get_current_org_id();
ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizacoes(id)
  DEFAULT public.get_current_org_id();
ALTER TABLE public.cliente_documentos
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizacoes(id)
  DEFAULT public.get_current_org_id();

CREATE INDEX IF NOT EXISTS idx_clientes_org ON public.clientes(org_id);
CREATE INDEX IF NOT EXISTS idx_documentos_org ON public.documentos(org_id);
CREATE INDEX IF NOT EXISTS idx_cliente_documentos_org ON public.cliente_documentos(org_id);

-- ────────────────────────────────────────────────────────────
-- 2. Backfill dos registos existentes
-- ────────────────────────────────────────────────────────────
-- 2a. clientes — org do criador (created_by → user_organizacoes)
UPDATE public.clientes c
   SET org_id = uo.org_id
  FROM public.user_organizacoes uo
 WHERE uo.user_id = c.created_by
   AND c.org_id IS NULL;

-- 2b. cliente_documentos — herda a org do cliente (cadeia fiável)
UPDATE public.cliente_documentos cd
   SET org_id = c.org_id
  FROM public.clientes c
 WHERE c.id = cd.cliente_id
   AND c.org_id IS NOT NULL
   AND cd.org_id IS NULL;

-- 2c. documentos — herda da cadeia cliente_documentos → clientes
UPDATE public.documentos d
   SET org_id = c.org_id
  FROM public.cliente_documentos cd
  JOIN public.clientes c ON c.id = cd.cliente_id
 WHERE cd.documento_id = d.id
   AND c.org_id IS NOT NULL
   AND d.org_id IS NULL;

-- 2d. documentos órfãos (sem ligação a cliente) — org do criador
UPDATE public.documentos d
   SET org_id = uo.org_id
  FROM public.user_organizacoes uo
 WHERE uo.user_id = d.created_by
   AND d.org_id IS NULL;

-- 2e. Fallback final: se sobrou algum NULL e só existe UMA organização
--     no sistema, atribui-a (cenário single-tenant actual).
DO $$
DECLARE
  v_org uuid;
BEGIN
  IF (SELECT count(*) FROM public.organizacoes) = 1 THEN
    SELECT id INTO v_org FROM public.organizacoes;
    UPDATE public.clientes           SET org_id = v_org WHERE org_id IS NULL;
    UPDATE public.documentos         SET org_id = v_org WHERE org_id IS NULL;
    UPDATE public.cliente_documentos SET org_id = v_org WHERE org_id IS NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. Política RESTRICTIVE rls_org_isolation (idêntica à dinâmica)
-- ────────────────────────────────────────────────────────────
-- FOR ALL: USING controla leitura/edição/apagar; WITH CHECK impede
-- criar/mover linhas para outra org. org_id NULL é aceite no CHECK
-- porque é preenchido pelo DEFAULT/backfill.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes', 'documentos', 'cliente_documentos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_org_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (org_id = public.get_current_org_id()) '
      || 'WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id())',
      'rls_org_isolation', t
    );
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. Índice único de documentos por org
-- ────────────────────────────────────────────────────────────
-- O unique global (tipo, numero) impediria duas orgs de terem o mesmo
-- número de documento. Passa a ser por organização.
DROP INDEX IF EXISTS public.uq_documentos_tipo_numero;
CREATE UNIQUE INDEX IF NOT EXISTS uq_documentos_org_tipo_numero
  ON public.documentos(org_id, tipo, numero)
  WHERE numero IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 5. NOT NULL — só se o backfill cobriu tudo (não bloqueia deploy)
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE org_id IS NULL) THEN
    ALTER TABLE public.clientes ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE WARNING 'clientes tem linhas com org_id NULL; NOT NULL não aplicado. Resolver manualmente.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.documentos WHERE org_id IS NULL) THEN
    ALTER TABLE public.documentos ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE WARNING 'documentos tem linhas com org_id NULL; NOT NULL não aplicado. Resolver manualmente.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cliente_documentos WHERE org_id IS NULL) THEN
    ALTER TABLE public.cliente_documentos ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE WARNING 'cliente_documentos tem linhas com org_id NULL; NOT NULL não aplicado. Resolver manualmente.';
  END IF;
END $$;
