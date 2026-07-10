-- ============================================================
-- Nível de bateria (viaturas elétricas) na entrega/recolha via token
-- ============================================================
-- A página de auto-serviço (RealizarEntregaPage) só registava
-- combustível, tratando viaturas elétricas como se tivessem depósito.
-- Acrescenta as colunas paralelas de eletricidade (espelham
-- combustivel_saida/entrada e combustivel_antiga/nova) e os parâmetros
-- correspondentes nas RPCs de confirmação por token.
-- ============================================================

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS eletricidade_saida   text,
  ADD COLUMN IF NOT EXISTS eletricidade_entrada text;

COMMENT ON COLUMN public.contratos_renting.eletricidade_saida IS
  'Nível de bateria (%) na entrega, para viaturas elétricas/híbridas. Paralelo a combustivel_saida.';
COMMENT ON COLUMN public.contratos_renting.eletricidade_entrada IS
  'Nível de bateria (%) na recolha, para viaturas elétricas/híbridas. Paralelo a combustivel_entrada.';

ALTER TABLE public.troca_viatura_registos
  ADD COLUMN IF NOT EXISTS eletricidade_antiga text,
  ADD COLUMN IF NOT EXISTS eletricidade_nova   text;

-- ── realizar_token_realizacao: entrega/recolha simples ──────────────
CREATE OR REPLACE FUNCTION public.realizar_token_realizacao(
  p_token uuid,
  p_km numeric,
  p_combustivel text,
  p_eletricidade text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    WHEN 'recolha' THEN 'devolvido'
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
         updated_by           = v_actor
   WHERE id = v_token.contrato_id;

  UPDATE public.realizacao_tokens
     SET used_at = now()
   WHERE id = v_token.id;
END;
$$;

-- ── realizar_token_troca: as duas viaturas envolvidas na troca ──────
CREATE OR REPLACE FUNCTION public.realizar_token_troca(
  p_token uuid,
  p_viatura_antiga_id uuid,
  p_km_antiga integer,
  p_combustivel_antiga text,
  p_viatura_nova_id uuid,
  p_km_nova integer,
  p_combustivel_nova text,
  p_eletricidade_antiga text DEFAULT NULL,
  p_eletricidade_nova text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token  realizacao_tokens%ROWTYPE;
  v_evento calendario_eventos%ROWTYPE;
  v_actor  uuid;
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
  IF v_token.tipo <> 'troca' THEN
    RAISE EXCEPTION 'Este token não é de troca.';
  END IF;
  IF v_token.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Token de outra organização.';
  END IF;

  SELECT * INTO v_evento FROM public.calendario_eventos WHERE id = v_token.evento_id;
  IF v_evento.realizado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Evento já realizado.';
  END IF;

  v_actor := COALESCE(auth.uid(), v_token.created_by);

  INSERT INTO public.troca_viatura_registos (
    org_id, evento_id, contrato_id,
    viatura_antiga_id, km_antiga, combustivel_antiga, eletricidade_antiga,
    viatura_nova_id, km_nova, combustivel_nova, eletricidade_nova,
    registado_por
  ) VALUES (
    v_token.org_id, v_token.evento_id, v_token.contrato_id,
    p_viatura_antiga_id, p_km_antiga, p_combustivel_antiga, p_eletricidade_antiga,
    p_viatura_nova_id, p_km_nova, p_combustivel_nova, p_eletricidade_nova,
    v_actor
  )
  ON CONFLICT (evento_id) DO UPDATE SET
    viatura_antiga_id    = EXCLUDED.viatura_antiga_id,
    km_antiga            = EXCLUDED.km_antiga,
    combustivel_antiga   = EXCLUDED.combustivel_antiga,
    eletricidade_antiga  = EXCLUDED.eletricidade_antiga,
    viatura_nova_id      = EXCLUDED.viatura_nova_id,
    km_nova              = EXCLUDED.km_nova,
    combustivel_nova     = EXCLUDED.combustivel_nova,
    eletricidade_nova    = EXCLUDED.eletricidade_nova;

  -- Actualiza km_atual de ambas as viaturas.
  IF p_viatura_antiga_id IS NOT NULL AND p_km_antiga IS NOT NULL THEN
    UPDATE public.viaturas SET km_atual = p_km_antiga WHERE id = p_viatura_antiga_id;
  END IF;
  IF p_viatura_nova_id IS NOT NULL AND p_km_nova IS NOT NULL THEN
    UPDATE public.viaturas SET km_atual = p_km_nova WHERE id = p_viatura_nova_id;
  END IF;

  UPDATE public.calendario_eventos
     SET realizado_em     = now(),
         realizado_por_id = v_actor
   WHERE id = v_token.evento_id;

  UPDATE public.realizacao_tokens
     SET used_at = now()
   WHERE id = v_token.id;
END;
$$;
