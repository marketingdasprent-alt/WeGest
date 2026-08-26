-- ============================================================
-- QR de recolha passa a FECHAR o contrato (parte 3b)
-- ============================================================
-- Ver 20260820150000. O token de recolha escrevia 'devolvido' — o estado da
-- viatura no lugar do do contrato. Passa a escrever 'fechado'.
--
-- O tipo_fecho fica intacto: é escolhido no diálogo de fecho e o QR limita-se
-- a confirmar que a viatura voltou. Confirmar a chegada não diz de que forma
-- ela chegou.
--
-- Mantém a guarda de 20260820140100: uma recolha não pode ser confirmada
-- enquanto houver entrega por realizar no mesmo contrato.
-- ============================================================

CREATE OR REPLACE FUNCTION public.realizar_token_realizacao(
  p_token uuid,
  p_km numeric,
  p_combustivel text,
  p_eletricidade text DEFAULT NULL::text,
  p_dua_original_levada boolean DEFAULT NULL,
  p_dua_devolvida boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token       realizacao_tokens%ROWTYPE;
  v_evento      calendario_eventos%ROWTYPE;
  v_novo_estado text;
  v_actor       uuid;
  v_km          integer := CASE WHEN p_km IS NULL THEN NULL ELSE round(p_km)::integer END;
BEGIN
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

  -- Ver cabeçalho: recolha exige entrega confirmada no mesmo contrato.
  IF v_token.tipo = 'recolha' AND EXISTS (
       SELECT 1
         FROM public.calendario_eventos
        WHERE origem_tipo   = 'contrato_renting'
          AND origem_id     = v_token.contrato_id
          AND tipo          = 'entrega'
          AND realizado_em IS NULL
     ) THEN
    RAISE EXCEPTION 'Este contrato ainda tem a entrega por confirmar — confirma a entrega da viatura antes de registar a recolha.';
  END IF;

  v_actor := COALESCE(auth.uid(), v_token.created_by);

  IF v_token.tipo = 'troca' THEN
    UPDATE public.contratos_renting
       SET km_saida            = COALESCE(v_km, km_saida),
           combustivel_saida   = COALESCE(p_combustivel, combustivel_saida),
           eletricidade_saida  = COALESCE(p_eletricidade, eletricidade_saida),
           updated_by          = v_actor
     WHERE id = v_token.contrato_id;

    UPDATE public.calendario_eventos
       SET realizado_em     = now(),
           realizado_por_id = v_actor
     WHERE id = v_token.evento_id;

    UPDATE public.realizacao_tokens
       SET used_at = now()
     WHERE id = v_token.id;

    RETURN;
  END IF;

  v_novo_estado := CASE v_token.tipo
    WHEN 'entrega' THEN 'em_curso'
    WHEN 'recolha' THEN 'fechado'
  END;
  IF v_novo_estado IS NULL THEN
    RAISE EXCEPTION 'Tipo de token inesperado: %.', v_token.tipo;
  END IF;

  UPDATE public.contratos_renting
     SET estado_operacional   = v_novo_estado::contrato_estado_operacional_enum,
         km_saida             = CASE WHEN v_token.tipo = 'entrega'
                                     THEN COALESCE(v_km, km_saida) ELSE km_saida END,
         combustivel_saida    = CASE WHEN v_token.tipo = 'entrega'
                                     THEN COALESCE(p_combustivel, combustivel_saida) ELSE combustivel_saida END,
         eletricidade_saida   = CASE WHEN v_token.tipo = 'entrega'
                                     THEN COALESCE(p_eletricidade, eletricidade_saida) ELSE eletricidade_saida END,
         km_entrada           = CASE WHEN v_token.tipo = 'recolha'
                                     THEN COALESCE(v_km, km_entrada) ELSE km_entrada END,
         combustivel_entrada  = CASE WHEN v_token.tipo = 'recolha'
                                     THEN COALESCE(p_combustivel, combustivel_entrada) ELSE combustivel_entrada END,
         eletricidade_entrada = CASE WHEN v_token.tipo = 'recolha'
                                     THEN COALESCE(p_eletricidade, eletricidade_entrada) ELSE eletricidade_entrada END,
         -- DUA: entrega marca que o motorista levou a original; recolha marca
         -- a devolução (só se a tinha em falta).
         dua_original_com_motorista = CASE
             WHEN v_token.tipo = 'entrega' AND p_dua_original_levada IS TRUE THEN true
             ELSE dua_original_com_motorista END,
         dua_devolvida_em     = CASE
             WHEN v_token.tipo = 'recolha' AND p_dua_devolvida IS TRUE
                  AND dua_original_com_motorista IS TRUE AND dua_devolvida_em IS NULL
             THEN now() ELSE dua_devolvida_em END,
         -- tipo_fecho NÃO é tocado aqui de propósito. Fica o que foi escolhido
         -- no diálogo de fecho, seja recolhido ou devolvido. O QR confirma que
         -- a viatura voltou; não é ele que decide de que forma voltou, e
         -- assumir 'devolvido' seria inventar dados que ninguém introduziu.
         -- Recolha gerada automaticamente por data_fim, sem diálogo nenhum,
         -- fica com tipo_fecho NULL — que é a verdade.
         updated_by           = v_actor
   WHERE id = v_token.contrato_id;

  UPDATE public.realizacao_tokens
     SET used_at = now()
   WHERE id = v_token.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.realizar_token_realizacao(uuid, numeric, text, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.realizar_token_realizacao(uuid, numeric, text, text, boolean, boolean) TO authenticated;
