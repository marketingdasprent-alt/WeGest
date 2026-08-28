-- ============================================================
-- Tokens de pairing para realização de entrega/recolha
-- ============================================================
-- Permite ao gestor abrir o contrato no laptop, scanear um QR e
-- ser redireccionado no telemóvel para a página de check-out com
-- a sessão já apontada ao evento certo. O token é uma fonte de
-- "deep link" — a autenticação continua a ser via Supabase auth.
--
-- Modelo:
--   - 1 token por chamada (não reutilizar)
--   - Expira em 30 minutos
--   - Após uso (used_at preenchido), o token deixa de ser válido
--   - Multi-tenant: token só visível à org do criador
-- ============================================================

CREATE TABLE IF NOT EXISTS public.realizacao_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  evento_id   uuid NOT NULL REFERENCES public.calendario_eventos(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.contratos_renting(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('entrega', 'recolha')),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  used_at     timestamptz,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_realizacao_tokens_evento
  ON public.realizacao_tokens (evento_id);
CREATE INDEX IF NOT EXISTS idx_realizacao_tokens_ativos
  ON public.realizacao_tokens (expires_at)
  WHERE used_at IS NULL;

-- RLS
ALTER TABLE public.realizacao_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_realizacao_tokens_select" ON public.realizacao_tokens;
DROP POLICY IF EXISTS "mt_realizacao_tokens_insert" ON public.realizacao_tokens;
DROP POLICY IF EXISTS "mt_realizacao_tokens_update" ON public.realizacao_tokens;

CREATE POLICY "mt_realizacao_tokens_select" ON public.realizacao_tokens
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_realizacao_tokens_insert" ON public.realizacao_tokens
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND created_by = auth.uid());

CREATE POLICY "mt_realizacao_tokens_update" ON public.realizacao_tokens
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id());

-- ============================================================
-- RPC: gerar token a partir de um evento pendente
-- ============================================================
CREATE OR REPLACE FUNCTION public.gerar_token_realizacao(
  p_evento_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento     calendario_eventos%ROWTYPE;
  v_contrato_id uuid;
  v_token_id   uuid;
BEGIN
  SELECT * INTO v_evento FROM public.calendario_eventos WHERE id = p_evento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento % não encontrado.', p_evento_id;
  END IF;

  IF v_evento.origem_tipo <> 'contrato_renting' THEN
    RAISE EXCEPTION 'Evento não vem de contrato de renting.';
  END IF;

  IF v_evento.tipo NOT IN ('entrega', 'recolha') THEN
    RAISE EXCEPTION 'Apenas eventos de entrega/recolha podem ser pareados.';
  END IF;

  IF v_evento.realizado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este evento já foi realizado.';
  END IF;

  v_contrato_id := v_evento.origem_id;

  -- Multi-tenant guard (verifica que o contrato é da nossa org)
  IF NOT EXISTS (
    SELECT 1 FROM public.contratos_renting
     WHERE id = v_contrato_id AND org_id = get_current_org_id()
  ) THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;

  INSERT INTO public.realizacao_tokens (
    org_id, evento_id, contrato_id, tipo, created_by
  )
  VALUES (
    get_current_org_id(), v_evento.id, v_contrato_id, v_evento.tipo, auth.uid()
  )
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_token_realizacao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_token_realizacao(uuid) TO authenticated;

COMMENT ON FUNCTION public.gerar_token_realizacao(uuid) IS
  'Gera token de deep-link para realizar entrega/recolha num evento. '
  'Token expira em 30min e só serve uma vez (marca-se used_at no consumo).';

-- ============================================================
-- View helper para consumo do token no telemóvel
-- ============================================================
CREATE OR REPLACE FUNCTION public.consumir_token_realizacao(
  p_token uuid
) RETURNS TABLE (
  evento_id   uuid,
  contrato_id uuid,
  tipo        text,
  matricula   text,
  cidade      text,
  data_inicio timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token realizacao_tokens%ROWTYPE;
  v_evento calendario_eventos%ROWTYPE;
BEGIN
  SELECT * INTO v_token FROM public.realizacao_tokens WHERE id = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido.';
  END IF;
  IF v_token.expires_at < now() THEN
    RAISE EXCEPTION 'Token expirado.';
  END IF;
  IF v_token.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Token já foi usado.';
  END IF;
  IF v_token.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Token de outra organização.';
  END IF;

  SELECT * INTO v_evento FROM public.calendario_eventos WHERE id = v_token.evento_id;
  IF v_evento.realizado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Evento já realizado.';
  END IF;

  RETURN QUERY SELECT
    v_evento.id,
    v_token.contrato_id,
    v_token.tipo,
    v_evento.titulo,
    v_evento.cidade,
    v_evento.data_inicio;
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_token_realizacao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consumir_token_realizacao(uuid) TO authenticated;

COMMENT ON FUNCTION public.consumir_token_realizacao(uuid) IS
  'Devolve os dados do evento associado a um token, validando expiração '
  'e org. Não marca o token como usado — isso só acontece após a realização '
  'efectiva via UPDATE direct em realizacao_tokens.used_at.';