-- ============================================================
-- FASE 1.1: Criar tabelas organizacoes, user_organizacoes
-- ============================================================

-- Tabela de organizações
CREATE TABLE IF NOT EXISTS public.organizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  codigo text NOT NULL UNIQUE,        -- código que o user usa no login
  logo_url text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Relação N:N entre users e organizações
CREATE TABLE IF NOT EXISTS public.user_organizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',  -- 'owner', 'admin', 'member'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_org_user ON public.user_organizacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_org_org ON public.user_organizacoes(org_id);

-- RLS
ALTER TABLE public.organizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizacoes ENABLE ROW LEVEL SECURITY;

-- Qualquer user autenticado pode ver orgs a que pertence
CREATE POLICY "Users podem ver orgs a que pertencem"
  ON public.organizacoes FOR SELECT TO authenticated
  USING (
    id IN (SELECT org_id FROM public.user_organizacoes WHERE user_id = auth.uid())
  );

-- Admins podem gerir orgs
CREATE POLICY "Admins podem gerir organizacoes"
  ON public.organizacoes FOR ALL TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- User pode ver as suas próprias associações
CREATE POLICY "Users podem ver as suas associacoes"
  ON public.user_organizacoes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins podem gerir associações
CREATE POLICY "Admins podem gerir user_organizacoes"
  ON public.user_organizacoes FOR ALL TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());
