-- Renovar um contrato TVDE deixa de criar uma versão nova.
--
-- Regra do negócio: o TVDE abre-se com data de início, cobra-se à semana e a
-- data de início NÃO muda ao renovar. Renovar é um acto que se regista — o
-- que muda o valor por semana é a troca de viatura, e essa continua a
-- versionar.
--
-- O que fazia antes: cada renovação fechava o contrato (substituido_em +
-- 'fechado') e criava uma versão nova com período de 30 dias. Isso partia o
-- contrato em pedaços mensais e, como a renovação é manual, bastava não a
-- fazer para o último pedaço expirar — e aí parava o aluguer e a viatura
-- ficava falsamente livre (ver 20260908090000).
--
-- Pior no dia-a-dia: quem estava atrasado tinha de renovar 30 dias de cada
-- vez para apanhar o atraso. O contrato 559 tem três versões de 2025 criadas
-- em Setembro de 2026 por causa disso, e faltavam-lhe ainda uns doze meses.
-- Agora a próxima renovação é calculada a partir de HOJE: uma renovação
-- resolve, seja qual for o atraso.
--
-- O rent-a-car continua exactamente como estava: lá a versão é a unidade de
-- facturação mensal (nasce com estado_financeiro 'pendente') e a data de fim
-- é mesmo o fim do aluguer.
--
-- Reordenação: o acerto de km da viatura e o cálculo do km excedente sobem
-- para antes do ramo, porque valem para os dois caminhos — e o excedente é
-- sobretudo do TVDE (150 dos 185 contratos têm limite de km com cobrança;
-- rent-a-car não tem nenhum). O extra continua a ser lançado no contrato
-- actual, como antes.

CREATE OR REPLACE FUNCTION public.renovar_contrato_renting(
  p_contrato_id uuid,
  p_km_inicio integer DEFAULT NULL,
  p_km_fim integer DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old            public.contratos_renting%ROWTYPE;
  v_user_id        uuid := auth.uid();
  v_new_id         uuid;
  v_inicio         timestamptz;
  v_fim            timestamptz;
  v_km_percorridos integer;
  v_km_limite      integer;
  v_km_valor       numeric;
  v_km_excesso     integer;
  v_km_total       numeric;
  v_extra_km_id    uuid;
BEGIN
  SELECT * INTO v_old FROM public.contratos_renting WHERE id = p_contrato_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', p_contrato_id;
  END IF;
  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato foi eliminado.';
  END IF;
  IF v_old.substituido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato já foi renovado/substituído. Renova a versão actual.';
  END IF;
  IF v_old.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;
  IF NOT COALESCE(v_old.is_longa_duracao, false) THEN
    RAISE EXCEPTION 'A renovação só se aplica a contratos de longa duração.';
  END IF;

  IF v_old.estado_operacional <> 'em_curso' THEN
    RAISE EXCEPTION
      'Só é possível renovar um contrato em curso (estado actual: %). Confirma a entrega/abertura do contrato antes de renovar.',
      v_old.estado_operacional;
  END IF;

  IF v_old.data_fim IS NULL AND v_old.regime <> 'tvde' THEN
    RAISE EXCEPTION 'Contrato sem data de fim — não é possível calcular o novo período.';
  END IF;
  IF p_km_inicio IS NOT NULL AND p_km_fim IS NOT NULL AND p_km_fim < p_km_inicio THEN
    RAISE EXCEPTION 'O km final (%) não pode ser inferior ao km inicial (%).', p_km_fim, p_km_inicio;
  END IF;

  -- ── Comum aos dois caminhos ────────────────────────────────────────────
  IF p_km_fim IS NOT NULL AND v_old.viatura_id IS NOT NULL THEN
    UPDATE public.viaturas
       SET km_atual = p_km_fim
     WHERE id = v_old.viatura_id
       AND (km_atual IS NULL OR p_km_fim >= km_atual);
  END IF;

  -- Km excedente do ciclo que fecha, lançado no contrato actual.
  IF p_km_inicio IS NOT NULL AND p_km_fim IS NOT NULL
     AND v_old.kms_incluidos IS NOT NULL THEN
    v_km_percorridos := p_km_fim - p_km_inicio;
    v_km_limite      := v_old.kms_incluidos;
    v_km_valor       := COALESCE(v_old.km_adicional_valor, 0);

    IF v_km_percorridos > v_km_limite AND v_km_valor > 0 THEN
      v_km_excesso := v_km_percorridos - v_km_limite;
      v_km_total   := v_km_excesso * v_km_valor;

      SELECT id INTO v_extra_km_id
        FROM public.renting_extras
       WHERE org_id = v_old.org_id AND nome = 'Km excedente'
       LIMIT 1;

      IF v_extra_km_id IS NULL THEN
        INSERT INTO public.renting_extras (org_id, nome, descricao, preco_unidade, tipo_calculo, ativo, created_by)
        VALUES (v_old.org_id, 'Km excedente',
                'Km acima do limite mensal — gerado automaticamente na renovação.',
                0, 'fixo', true, v_user_id)
        RETURNING id INTO v_extra_km_id;
      END IF;

      INSERT INTO public.contrato_extras (
        org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
      )
      VALUES (
        v_old.org_id, v_old.id, v_extra_km_id,
        'Km excedente (' || v_km_excesso || ' km × ' || to_char(v_km_valor, 'FM999990.00') || ' €)',
        v_km_valor, 'fixo', v_km_excesso, v_km_total
      );
    END IF;
  END IF;

  -- ── TVDE: renovar não versiona ─────────────────────────────────────────
  IF v_old.regime = 'tvde' THEN
    -- A partir de HOJE, não do prazo antigo: quem está atrasado resolve numa
    -- renovação em vez de repetir o acto 30 dias de cada vez.
    v_fim := public.proxima_data_renovacao(
               now(), v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias);

    UPDATE public.contratos_renting
       SET proxima_renovacao_em = v_fim,
           km_saida             = COALESCE(p_km_fim, km_saida),
           updated_by           = v_user_id
     WHERE id = v_old.id;

    INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
    VALUES (
      v_old.id, v_old.org_id, 'alteracao', v_user_id,
      'Renovado em ' || to_char(now(), 'DD/MM/YYYY') ||
      '. Próxima renovação: ' || to_char(v_fim, 'DD/MM/YYYY') ||
      '. A data de início do contrato mantém-se.'
    );

    RETURN v_old.id;
  END IF;

  -- ── Rent-a-car: a versão é a unidade de facturação, versiona como sempre ─
  v_inicio := COALESCE(v_old.data_fim, now());
  v_fim    := public.proxima_data_renovacao(
                v_inicio, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias);

  UPDATE public.contratos_renting
     SET substituido_em     = now(),
         estado_operacional = 'fechado'::contrato_estado_operacional_enum,
         updated_by         = v_user_id,
         km_saida           = COALESCE(p_km_inicio, km_saida),
         km_entrada         = COALESCE(p_km_fim, km_entrada)
   WHERE id = v_old.id;

  INSERT INTO public.contratos_renting (
    org_id, reserva_id, transferista_id, cliente_id, emissor_id, gestor_id,
    viatura_id, matricula, grupo,
    estacao_entrega_id, data_inicio, estacao_recolha_id, data_fim, estacao_origem_viatura_id,
    estado_operacional, estado_financeiro, origem, regime,
    tarifa_diaria, tarifa_id, desconto_percentagem, taxa_iva, valor_total_manual,
    is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias,
    franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
    km_saida,
    dua_original_com_motorista, dua_observacoes,
    voucher_codigo, numero_processo, voo_referencia,
    local_entrega, local_recolha, comentarios_entrega, comentarios_recolha,
    observacoes, observacoes_internas,
    versao, contrato_anterior_id, motivo_versao,
    created_by
  )
  VALUES (
    v_old.org_id, v_old.reserva_id, v_old.transferista_id, v_old.cliente_id, v_old.emissor_id, v_old.gestor_id,
    v_old.viatura_id, v_old.matricula, v_old.grupo,
    v_old.estacao_entrega_id, v_inicio, v_old.estacao_recolha_id, v_fim, v_old.estacao_origem_viatura_id,
    'em_curso'::contrato_estado_operacional_enum,
    'pendente', v_old.origem, v_old.regime,
    v_old.tarifa_diaria, v_old.tarifa_id, v_old.desconto_percentagem, v_old.taxa_iva, v_old.valor_total_manual,
    v_old.is_longa_duracao, v_old.renovacao_opcao, v_old.renovacao_intervalo_dias,
    v_old.franquia_valor, v_old.caucao_valor, v_old.kms_incluidos, v_old.km_adicional_valor,
    p_km_fim,
    v_old.dua_original_com_motorista, v_old.dua_observacoes,
    v_old.voucher_codigo, v_old.numero_processo, v_old.voo_referencia,
    v_old.local_entrega, v_old.local_recolha, v_old.comentarios_entrega, v_old.comentarios_recolha,
    v_old.observacoes, v_old.observacoes_internas,
    v_old.versao + 1, v_old.id,
    'Renovação — período de ' || to_char(v_inicio, 'YYYY-MM-DD') || ' a ' || to_char(v_fim, 'YYYY-MM-DD'),
    v_user_id
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.contrato_condutores (org_id, contrato_id, cliente_id, motorista_id, is_principal)
  SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
    FROM public.contrato_condutores WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_coberturas (org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor)
  SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    FROM public.contrato_coberturas WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_extras (org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total)
  SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    FROM public.contrato_extras WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_taxas (org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado)
  SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    FROM public.contrato_taxas WHERE contrato_id = v_old.id;

  DELETE FROM public.calendario_eventos
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = v_new_id
     AND tipo IN ('entrega', 'recolha')
     AND realizado_em IS NULL;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.renovar_contrato_renting(uuid, integer, integer) IS
  'Renova um contrato de longa duração. TVDE: não versiona — avança proxima_renovacao_em a partir de hoje, regista no histórico e devolve o MESMO id; a data de início do contrato nunca muda. Rent-a-car: versiona como sempre, porque lá a versão é a unidade de facturação mensal. O km excedente do ciclo é lançado no contrato actual nos dois casos.';
