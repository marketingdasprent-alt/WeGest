-- ============================================================
-- Fix: convites quebra isolamento multi-tenant (2 falhas)
-- ============================================================
-- 1) "Admins can manage convites" (ALL) só verificava
--    profiles.is_admin = true, sem filtro de org_id. Um admin de
--    qualquer org conseguia ler/editar/apagar convites de TODAS as
--    outras orgs.
-- 2) "Anyone can validate invite tokens" (SELECT, anon) tinha
--    USING (true) — expõe email+token+org_id de TODOS os convites de
--    TODAS as orgs a qualquer visitante não autenticado via API REST,
--    em vez de só validar o token específico pedido pelo cliente.
--
-- Fix: policy de admin ganha org_id = get_current_org_id() (mantendo
-- is_decada_ousada_admin() como bypass intencional do dono da
-- plataforma). SELECT anon aberto é substituído por 2 RPCs
-- SECURITY DEFINER que só devolvem/alteram a linha do token pedido
-- (mesmo padrão de segurança que os restantes tokens do projeto:
-- danos_tokens, quadro_tokens, realizacao_tokens).
--
-- Frontend afetado: src/pages/Register.tsx (troca SELECT direto por
-- rpc('validar_convite_token') e UPDATE direto por
-- rpc('marcar_convite_usado')).
--
-- Deploy: aplicar à mão no SQL editor (CI não faz db push).
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage convites" ON public.convites;
DROP POLICY IF EXISTS "Anyone can validate invite tokens" ON public.convites;

CREATE POLICY "mt_convites_admin_manage"
  ON public.convites FOR ALL
  TO authenticated
  USING (
    (
      org_id = public.get_current_org_id()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    )
    OR public.is_decada_ousada_admin()
  )
  WITH CHECK (
    (
      org_id = public.get_current_org_id()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    )
    OR public.is_decada_ousada_admin()
  );

-- Substitui o SELECT anon aberto: devolve só a linha do token pedido,
-- e só se ainda estiver válido (não usado, não expirado).
CREATE OR REPLACE FUNCTION public.validar_convite_token(p_token text)
RETURNS TABLE (
  email text,
  cargo_id uuid,
  cargo_nome text,
  org_id uuid,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.email, c.cargo_id, cg.nome, c.org_id, c.expires_at
  FROM public.convites c
  LEFT JOIN public.cargos cg ON cg.id = c.cargo_id
  WHERE c.token = p_token
    AND c.usado = false
    AND c.expires_at > now();
$$;

GRANT EXECUTE ON FUNCTION public.validar_convite_token(text) TO anon, authenticated;

-- Substitui o UPDATE directo (que já era bloqueado silenciosamente por
-- RLS, sem policy de UPDATE para authenticated não-admin).
CREATE OR REPLACE FUNCTION public.marcar_convite_usado(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.convites
    SET usado = true
    WHERE token = p_token AND usado = false AND expires_at > now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_convite_usado(text) TO anon, authenticated;

-- ============================================================
-- VERIFICAÇÃO (correr manualmente após aplicar):
--   Com a anon key, sem sessão:
--     select * from convites;  -- deve dar 0 linhas (sem policy SELECT p/ anon)
--     select * from validar_convite_token('<token_real>');  -- deve dar 1 linha
--   Com sessão de admin da org A:
--     select * from convites;  -- só linhas org_id = org A
-- ============================================================
