-- ============================================================
-- FASE 1.2: Tabela de org ativa + função get_current_org_id()
-- ============================================================

-- Armazena a org ativa do utilizador (uma por user)
CREATE TABLE IF NOT EXISTS public.user_org_ativa (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE
);

ALTER TABLE public.user_org_ativa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User gere a sua org ativa"
  ON public.user_org_ativa FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Função helper: retorna o org_id ativo do user atual
CREATE OR REPLACE FUNCTION public.get_current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.user_org_ativa WHERE user_id = auth.uid();
$$;
