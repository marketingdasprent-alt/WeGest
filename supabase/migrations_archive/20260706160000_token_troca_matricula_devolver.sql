-- ============================================================
-- consumir_token_realizacao: expõe matricula_devolver (útil na troca)
-- ============================================================
-- Na troca, o gestor precisa de ver as DUAS matrículas no ecrã de
-- realização — a nova (que fica) e a antiga (a devolver) — para não
-- confundir qual viatura está a documentar. Já existe em
-- calendario_eventos.matricula_devolver; só faltava expor na RPC.
-- ============================================================

-- Mudar o RETURNS TABLE exige DROP (Postgres não troca a assinatura de saída
-- via CREATE OR REPLACE); grants são reaplicadas a seguir.
DROP FUNCTION IF EXISTS public.consumir_token_realizacao(uuid);

CREATE OR REPLACE FUNCTION public.consumir_token_realizacao(
  p_token uuid
) RETURNS TABLE (
  evento_id           uuid,
  contrato_id          uuid,
  tipo                 text,
  matricula            text,
  matricula_devolver   text,
  cidade               text,
  data_inicio          timestamptz
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
    v_evento.matricula_devolver,
    v_evento.cidade,
    v_evento.data_inicio;
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_token_realizacao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consumir_token_realizacao(uuid) TO authenticated;

COMMENT ON FUNCTION public.consumir_token_realizacao(uuid) IS
  'Devolve os dados do evento associado a um token, incluindo matricula_devolver '
  '(relevante na troca — mostra a viatura nova e a antiga). Não marca o token '
  'como usado — isso só acontece após a realização.';
