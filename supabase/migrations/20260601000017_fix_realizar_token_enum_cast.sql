-- ============================================================
-- Fix: realizar_token_realizacao — cast text → enum
-- ============================================================
-- A função declarava `v_novo_estado text` e fazia
--   UPDATE contratos_renting SET estado_operacional = v_novo_estado
-- Atribuir uma VARIÁVEL text a uma coluna do tipo
-- contrato_estado_operacional_enum dá erro 42804
-- ("column is of type ..._enum but expression is of type text").
-- Os literais ('em_curso'...) funcionam por serem unknown, mas a
-- variável é text — é preciso castar explicitamente (como já se faz
-- na cascata com ::reserva_estado_enum).
--
-- Isto partia o check-in/recolha por token (QR no telemóvel).
-- Idempotente (CREATE OR REPLACE).
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
  -- ::enum obrigatório: v_novo_estado é text (ver 42804 acima).
  UPDATE public.contratos_renting
     SET estado_operacional = v_novo_estado::contrato_estado_operacional_enum,
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
