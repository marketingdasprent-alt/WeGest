-- ============================================================
-- Migration: quadro_tokens — token público por org p/ TV dashboard
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quadro_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE
             DEFAULT public.get_current_org_id(),
  token      UUID NOT NULL DEFAULT gen_random_uuid(),
  ativo      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- token único (lookup rápido na edge function)
CREATE UNIQUE INDEX IF NOT EXISTS uq_quadro_tokens_token
  ON public.quadro_tokens (token);

-- no máximo 1 token ativo por org
CREATE UNIQUE INDEX IF NOT EXISTS uq_quadro_tokens_org_ativo
  ON public.quadro_tokens (org_id) WHERE ativo;

ALTER TABLE public.quadro_tokens ENABLE ROW LEVEL SECURITY;

-- Isolamento multi-tenant (RESTRICTIVE) — padrão do projeto
DO $$ BEGIN
  CREATE POLICY rls_org_isolation ON public.quadro_tokens
    AS RESTRICTIVE FOR ALL
    USING (org_id = public.get_current_org_id())
    WITH CHECK (org_id = public.get_current_org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Gestão (só admin/gestor autenticado cria/revoga)
DO $$ BEGIN
  CREATE POLICY quadro_tokens_manage ON public.quadro_tokens
    AS PERMISSIVE FOR ALL
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
