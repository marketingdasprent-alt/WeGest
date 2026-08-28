-- ============================================================
-- Idempotência dos danos/fotos registados via token de realização
-- ============================================================
-- Bug: handleConfirmar/handleConfirmarTroca fazem upload de fotos e
-- criam viatura_danos ANTES de chamar realizar_token_realizacao. Se a RPC
-- falhar depois do upload ter sucesso (rede, token expirou entretanto),
-- os danos ficam gravados mas o evento nunca fica marcado como realizado.
-- Como a página não gera novo token ao retry (usa o do URL), reenviar
-- cria um SEGUNDO conjunto de danos duplicado, sem limpar o anterior.
--
-- Fix: cada dano criado por este fluxo passa a guardar de que token veio.
-- Uma RPC dedicada (SECURITY DEFINER — quem confirma no terreno raramente
-- é admin, e o DELETE directo em viatura_danos exige is_current_user_admin())
-- apaga os danos da tentativa anterior falhada antes do frontend recriar,
-- filtrando estritamente por realizacao_token_id = este token — nunca toca
-- em danos doutras entregas/recolhas ou no histórico da viatura.
-- ============================================================

ALTER TABLE public.viatura_danos
  ADD COLUMN IF NOT EXISTS realizacao_token_id uuid REFERENCES public.realizacao_tokens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_viatura_danos_realizacao_token
  ON public.viatura_danos(realizacao_token_id)
  WHERE realizacao_token_id IS NOT NULL;

COMMENT ON COLUMN public.viatura_danos.realizacao_token_id IS
  'Token que originou este dano via check-in/QR (RealizarEntregaPage). NULL para '
  'danos registados manualmente. Permite limpar/recriar num retry sem duplicar.';

CREATE OR REPLACE FUNCTION public.limpar_danos_token(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token realizacao_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token FROM public.realizacao_tokens WHERE id = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido.';
  END IF;
  IF v_token.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Token de outra organização.';
  END IF;
  IF v_token.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Token já foi usado — não é possível repetir a confirmação.';
  END IF;

  -- viatura_dano_fotos cai com ON DELETE CASCADE (ver 20260405/similar).
  -- Ficheiros já enviados ao storage ficam órfãos no bucket — aceitável
  -- (best-effort, mesmo padrão do cleanup client-side em caso de erro).
  DELETE FROM public.viatura_danos
   WHERE realizacao_token_id = p_token;
END;
$$;

COMMENT ON FUNCTION public.limpar_danos_token(uuid) IS
  'Apaga danos/fotos criados por uma tentativa anterior falhada do mesmo token, '
  'antes do frontend recriar — evita duplicar em retry. SECURITY DEFINER porque '
  'quem confirma o token no terreno normalmente não é admin (RLS de DELETE em '
  'viatura_danos exige is_current_user_admin()).';

GRANT EXECUTE ON FUNCTION public.limpar_danos_token(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
