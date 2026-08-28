-- ============================================================
-- Realização de entrega/recolha via token — num único passo atómico
-- ============================================================
-- O fluxo no telemóvel fazia 2 chamadas sequenciais a partir do
-- frontend:
--   1) UPDATE contratos_renting SET estado_operacional = ...
--   2) UPDATE realizacao_tokens SET used_at = now()
-- Se a rede caísse entre as duas, o contrato mudava de estado (e o
-- trigger marcava o evento realizado) mas o token ficava por usar.
-- O `realizado_em` do evento já protegia contra dupla-realização,
-- mas o token ficava "vivo" até expirar.
--
-- Este RPC junta tudo numa única transação: valida o token, muda o
-- estado do contrato (dispara cascata_realizacao) e marca o token
-- usado — ou tudo, ou nada.
--
-- Bónus: grava `updated_by = auth.uid()` no contrato para que o
-- `realizado_por_id` do evento fique correctamente atribuído a quem
-- scaneou o QR (modelo "pool": quem realiza fisicamente é registado).
-- ============================================================
CREATE OR REPLACE FUNCTION public.realizar_token_realizacao(
  p_token uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token       realizacao_tokens%ROWTYPE;
  v_evento      calendario_eventos%ROWTYPE;
  v_novo_estado text;
BEGIN
  -- Bloqueia a linha do token para serializar consumos concorrentes.
  SELECT * INTO v_token
    FROM public.realizacao_tokens
   WHERE id = p_token
   FOR UPDATE;

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

  v_novo_estado := CASE v_token.tipo
    WHEN 'entrega' THEN 'em_curso'
    WHEN 'recolha' THEN 'devolvido'
  END;
  IF v_novo_estado IS NULL THEN
    RAISE EXCEPTION 'Tipo de token inesperado: %.', v_token.tipo;
  END IF;

  -- Muda o estado do contrato. Dispara trg_contrato_renting_cascata_realizacao,
  -- que marca o evento correspondente como realizado. updated_by garante a
  -- atribuição correcta de realizado_por_id a quem scaneou.
  UPDATE public.contratos_renting
     SET estado_operacional = v_novo_estado,
         updated_by         = auth.uid()
   WHERE id = v_token.contrato_id;

  -- Marca o token usado — na mesma transação que a mudança de estado.
  UPDATE public.realizacao_tokens
     SET used_at = now()
   WHERE id = v_token.id;
END;
$$;

REVOKE ALL ON FUNCTION public.realizar_token_realizacao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.realizar_token_realizacao(uuid) TO authenticated;

COMMENT ON FUNCTION public.realizar_token_realizacao(uuid) IS
  'Realiza a entrega/recolha associada a um token numa única transação: '
  'valida o token, muda estado_operacional do contrato (dispara a cascata '
  'que marca o evento realizado) e marca o token usado. Atómico — substitui '
  'os 2 UPDATEs sequenciais que o frontend fazia.';
