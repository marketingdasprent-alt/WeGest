-- F03 (salvar_precos_modelo_tarifa) ficou em 20260925100000, já aplicada: essa
-- versão acrescenta a recusa de tirar preços em uso e não pode ser substituída.

CREATE OR REPLACE FUNCTION public.fn_ensure_cliente_condutor(p_motorista_id uuid, p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mot record;
  v_cli uuid;
BEGIN
  SELECT * INTO v_mot FROM public.motoristas_ativos
  WHERE id = p_motorista_id AND org_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Motorista inexistente nesta organização' USING ERRCODE = '42501';
  END IF;

  IF v_mot.cliente_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.clientes WHERE id = v_mot.cliente_id AND org_id = p_org_id
    ) THEN
      RAISE EXCEPTION 'Cliente do motorista pertence a outra organização' USING ERRCODE = '42501';
    END IF;
    RETURN v_mot.cliente_id;
  END IF;

  IF v_mot.nif IS NOT NULL AND length(btrim(v_mot.nif)) > 0 THEN
    SELECT id INTO v_cli FROM public.clientes
    WHERE org_id = p_org_id AND tipo_cliente = 'condutor'
      AND nif = v_mot.nif AND deleted_at IS NULL
    LIMIT 1;
  END IF;
  IF v_cli IS NULL THEN
    INSERT INTO public.clientes (org_id, tipo_cliente, is_empresa, nome, nif, email, telefone)
    VALUES (v_mot.org_id, 'condutor', false, v_mot.nome, v_mot.nif, v_mot.email, v_mot.telefone)
    RETURNING id INTO v_cli;
  END IF;
  UPDATE public.motoristas_ativos SET cliente_id = v_cli
  WHERE id = p_motorista_id AND org_id = p_org_id;
  RETURN v_cli;
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_movimentos_recorrentes(p_semanas_a_frente integer DEFAULT 0)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rec record;
  v_semana_ref date;
  v_semana_do_mes integer;
  v_primeira_segunda date;
  v_alvo date;
  v_deve_gerar boolean;
  v_criadas integer := 0;
  v_rowcount integer;
BEGIN
  -- O cron usa 0; antecipações internas ficam limitadas às próximas quatro semanas.
  IF p_semanas_a_frente IS NULL OR p_semanas_a_frente NOT BETWEEN 0 AND 4 THEN
    RAISE EXCEPTION 'A antecipação deve estar entre 0 e 4 semanas' USING ERRCODE = '22023';
  END IF;
  v_semana_ref := (date_trunc('week', current_date) + (p_semanas_a_frente || ' weeks')::interval)::date;
  FOR v_rec IN
    SELECT * FROM public.motorista_financeiro_recorrencias r
    WHERE r.status = 'ativa' AND r.semana_ancora <= v_semana_ref
      AND (r.data_fim IS NULL OR v_semana_ref <= r.data_fim)
      AND (r.max_ocorrencias IS NULL OR r.ocorrencias_geradas < r.max_ocorrencias)
  LOOP
    v_deve_gerar := false;
    IF v_rec.frequencia = 'semanal' THEN
      v_deve_gerar := true;
    ELSE
      v_semana_do_mes := ceil(extract(day FROM v_rec.semana_ancora) / 7.0)::integer;
      v_primeira_segunda := (date_trunc('month', v_semana_ref)::date)
        + ((8 - extract(isodow FROM date_trunc('month', v_semana_ref)::date)::integer) % 7);
      v_alvo := v_primeira_segunda + ((v_semana_do_mes - 1) * 7);
      v_deve_gerar := (v_alvo = v_semana_ref) AND (extract(month FROM v_alvo) = extract(month FROM v_semana_ref));
    END IF;
    CONTINUE WHEN NOT v_deve_gerar;
    INSERT INTO public.motorista_financeiro (
      motorista_id, org_id, tipo, categoria, descricao, valor,
      data_movimento, status, referencia, recorrencia_id
    ) VALUES (
      v_rec.motorista_id, v_rec.org_id, v_rec.tipo, v_rec.categoria, v_rec.descricao,
      v_rec.valor, v_semana_ref, 'pendente', v_rec.referencia_base, v_rec.id
    )
    ON CONFLICT (recorrencia_id, data_movimento) WHERE recorrencia_id IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount > 0 THEN
      v_criadas := v_criadas + 1;
      UPDATE public.motorista_financeiro_recorrencias
      SET ocorrencias_geradas = ocorrencias_geradas + 1,
          status = CASE
            WHEN max_ocorrencias IS NOT NULL AND ocorrencias_geradas + 1 >= max_ocorrencias THEN 'concluida'
            ELSE status
          END,
          updated_at = now()
      WHERE id = v_rec.id;
    END IF;
  END LOOP;
  RETURN v_criadas;
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_seguros_semanais(p_semanas_a_frente integer DEFAULT 0)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_motorista record;
  v_inicio date;
  v_fim date;
  v_ref text;
  v_criadas integer := 0;
  v_rowcount integer;
BEGIN
  IF p_semanas_a_frente IS NULL OR p_semanas_a_frente NOT BETWEEN 0 AND 4 THEN
    RAISE EXCEPTION 'A antecipação deve estar entre 0 e 4 semanas' USING ERRCODE = '22023';
  END IF;
  v_inicio := (date_trunc('week', current_date) + (p_semanas_a_frente || ' weeks')::interval)::date;
  v_fim := v_inicio + 6;
  FOR v_motorista IN
    SELECT m.id, m.org_id, m.seguro_valor_semanal FROM public.motoristas_ativos m
    WHERE m.status_ativo = true AND m.seguro_valor_semanal IS NOT NULL AND m.seguro_valor_semanal > 0
  LOOP
    v_ref := 'seguro-auto:' || v_motorista.id || ':' || to_char(v_inicio, 'YYYY-MM-DD');
    INSERT INTO public.motorista_financeiro (
      motorista_id, org_id, tipo, categoria, descricao, valor,
      data_movimento, status, referencia
    ) VALUES (
      v_motorista.id, v_motorista.org_id, 'debito', 'seguros',
      'Seguro semanal (' || to_char(v_inicio, 'DD/MM') || ' a ' || to_char(v_fim, 'DD/MM/YYYY') || ')',
      v_motorista.seguro_valor_semanal, v_inicio, 'pendente', v_ref
    )
    ON CONFLICT (referencia) WHERE categoria = 'seguros' AND referencia LIKE 'seguro-auto:%' DO NOTHING;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount > 0 THEN
      v_criadas := v_criadas + 1;
    END IF;
  END LOOP;
  RETURN v_criadas;
END;
$$;

CREATE OR REPLACE FUNCTION public.via_verde_sync_queue_claim(p_max integer)
RETURNS SETOF public.via_verde_sync_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_running_count integer;
  v_capacity integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('via_verde_sync_queue_claim')) THEN
    RETURN;
  END IF;
  UPDATE public.via_verde_sync_queue
  SET status = 'failed', completed_at = now(),
      error_message = 'Timeout: execução ultrapassou 15 minutos'
  WHERE status = 'running' AND started_at < now() - interval '15 minutes';
  SELECT count(*) INTO v_running_count FROM public.via_verde_sync_queue WHERE status = 'running';
  -- O plano Via Verde suporta no máximo dois robots simultâneos, mesmo entre tenants.
  v_capacity := GREATEST(LEAST(GREATEST(COALESCE(p_max, 0), 0), 2) - v_running_count, 0);
  IF v_capacity = 0 THEN
    RETURN;
  END IF;
  RETURN QUERY
  UPDATE public.via_verde_sync_queue q
  SET status = 'running', started_at = now()
  FROM (
    SELECT id FROM public.via_verde_sync_queue
    WHERE status = 'pending' ORDER BY created_at ASC
    LIMIT v_capacity FOR UPDATE SKIP LOCKED
  ) claimed
  WHERE q.id = claimed.id
  RETURNING q.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ensure_cliente_condutor(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_slot_inserir_cobranca(public.reservas, date, date, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gerar_movimentos_recorrentes(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gerar_seguros_semanais(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.via_verde_sync_queue_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ensure_cliente_condutor(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_slot_inserir_cobranca(public.reservas, date, date, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_movimentos_recorrentes(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_seguros_semanais(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.via_verde_sync_queue_claim(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
