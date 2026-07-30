-- supabase/migrations/20260730150000_acordo_cessao_motorista_desbloqueada.sql
-- ============================================================
-- Parcelamento: dívida de um contrato TVDE é sempre do motorista
-- ============================================================
-- Pedido explícito do utilizador (30/07/2026): num contrato TVDE, a dívida
-- de uma fatura parcelada nunca é da empresa/titular — é sempre do
-- motorista responsável, e tem de aparecer no painel dele (vista do
-- devedor, /motorista/painel/acordos/:id) e no perfil dele para a equipa
-- (aba Financeiro do motorista, motorista_financeiro).
--
-- A infraestrutura para isto já existia quase toda (acordo_criar já grava
-- responsavel_motorista_id e o débito em motorista_financeiro na cessão;
-- acordo_vista_devedor já autoriza motoristas_ativos.user_id = auth.uid();
-- a aba Financeiro do motorista já lista TODAS as linhas de
-- motorista_financeiro, sem filtro de categoria) — só estava bloqueada por
-- UMA razão concreta, documentada no próprio código: o caminho de
-- pagamento (acordo_parcela_registar_pagamento → INSERT recibos) só aceita
-- `clientes` em entidade_id (FK), nunca motoristas_ativos. Esta migração
-- resolve exactamente essa razão e levanta o bloqueio.

-- 1) acordo_criar — remove o bloqueio. Todo o resto da função já lidava
--    corretamente com responsavel_papel='motorista' (estava só morto).
CREATE OR REPLACE FUNCTION public.acordo_criar(
  p_cobranca_id             uuid,
  p_responsavel_papel       text,
  p_responsavel_id          uuid,
  p_parcelas                jsonb,
  p_frequencia              text,
  p_dia_vencimento          smallint DEFAULT NULL,
  p_aviso_antecedencia_dias smallint DEFAULT 3,
  p_observacoes             text     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v_cob      public.contrato_cobrancas%ROWTYPE;
  v_saldo    numeric(12,2);
  v_soma     numeric(12,2);
  v_acordo   uuid;
  v_titular  public.clientes%ROWTYPE;
  v_resp_nome text;
  v_invoice  uuid;
  v_org      uuid;
  p          jsonb;
BEGIN
  SELECT * INTO v_cob FROM public.contrato_cobrancas WHERE id = p_cobranca_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança não encontrada.';
  END IF;
  v_org := v_cob.org_id;

  IF v_cob.estado NOT IN ('emitida','paga') THEN
    RAISE EXCEPTION 'Só é possível parcelar uma cobrança já emitida (estado atual: %).', v_cob.estado;
  END IF;

  -- Fatura-Recibo já nasce liquidada — não há dívida para parcelar.
  IF TRIM(v_cob.descricao) ILIKE 'factura-recibo%' OR TRIM(v_cob.descricao) ILIKE 'fatura-recibo%' THEN
    RAISE EXCEPTION 'Faturas-Recibo (FR) já estão liquidadas e não podem ser parceladas.';
  END IF;

  SELECT id INTO v_invoice FROM public.invoices
   WHERE cobranca_id = p_cobranca_id AND status = 'emitida' AND tipo = 'FT'
   ORDER BY created_at DESC LIMIT 1;

  v_saldo := public.cobranca_saldo_por_liquidar(p_cobranca_id);
  IF v_saldo <= 0.005 THEN
    RAISE EXCEPTION 'Esta fatura não tem saldo por liquidar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.acordos_pagamento
              WHERE cobranca_id = p_cobranca_id AND estado IN ('ativo','incumprimento')) THEN
    RAISE EXCEPTION 'Esta fatura já tem um acordo de pagamento ativo.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.acordos_pagamento
              WHERE cobranca_id = p_cobranca_id
                AND estado = 'cancelado' AND cessao_aplicada = true) THEN
    RAISE EXCEPTION 'Existe uma cessão de dívida por reverter nesta fatura. Reverta o acordo cancelado antes de criar um novo.';
  END IF;

  IF p_parcelas IS NULL OR jsonb_array_length(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'O plano tem de ter pelo menos uma parcela.';
  END IF;

  IF (SELECT count(*) FROM jsonb_array_elements(p_parcelas) e
       WHERE (e->>'numero')::int > 0) > 24 THEN
    RAISE EXCEPTION 'O plano não pode ter mais de 24 parcelas.';
  END IF;

  SELECT COALESCE(SUM((e->>'valor')::numeric), 0) INTO v_soma
    FROM jsonb_array_elements(p_parcelas) e;

  IF abs(v_soma - v_saldo) >= 0.005 THEN
    RAISE EXCEPTION 'A soma das parcelas (%) não corresponde ao saldo por liquidar (%).',
      v_soma, v_saldo;
  END IF;

  SELECT * INTO v_titular FROM public.clientes WHERE id = v_cob.destinatario_id;

  IF p_responsavel_papel = 'motorista' THEN
    SELECT nome INTO v_resp_nome FROM public.motoristas_ativos WHERE id = p_responsavel_id;
  ELSE
    SELECT nome INTO v_resp_nome FROM public.clientes WHERE id = p_responsavel_id;
  END IF;
  IF v_resp_nome IS NULL THEN
    RAISE EXCEPTION 'Entidade responsável não encontrada.';
  END IF;

  INSERT INTO public.acordos_pagamento (
    org_id, cobranca_id, invoice_id,
    titular_id, titular_nome, titular_nif,
    responsavel_cliente_id, responsavel_motorista_id, responsavel_papel, responsavel_nome,
    valor_total, frequencia, dia_vencimento, aviso_antecedencia_dias, observacoes
  ) VALUES (
    v_org, p_cobranca_id, v_invoice,
    v_cob.destinatario_id, COALESCE(v_titular.nome, v_cob.destinatario_nome), v_titular.nif,
    CASE WHEN p_responsavel_papel = 'motorista' THEN NULL ELSE p_responsavel_id END,
    CASE WHEN p_responsavel_papel = 'motorista' THEN p_responsavel_id ELSE NULL END,
    p_responsavel_papel, v_resp_nome,
    v_saldo, p_frequencia, p_dia_vencimento, COALESCE(p_aviso_antecedencia_dias, 3), p_observacoes
  ) RETURNING id INTO v_acordo;

  FOR p IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
    INSERT INTO public.acordo_parcelas (org_id, acordo_id, numero, data_vencimento, valor)
    VALUES (v_org, v_acordo, (p->>'numero')::smallint,
            (p->>'data_vencimento')::date, (p->>'valor')::numeric);
  END LOOP;

  -- ── Cessão de dívida ──────────────────────────────────────────────────
  IF NOT (p_responsavel_papel <> 'motorista' AND p_responsavel_id = v_cob.destinatario_id) THEN
    INSERT INTO public.conta_movimentos
      (org_id, entidade_id, tipo, valor, origem, contrato_id, acordo_id, descricao)
    VALUES
      (v_org, v_cob.destinatario_id, 'credito', v_saldo, 'cessao', v_cob.contrato_id, v_acordo,
       'Dívida cedida a ' || v_resp_nome);

    IF p_responsavel_papel = 'motorista' THEN
      INSERT INTO public.motorista_financeiro
        (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, acordo_id)
      VALUES
        (v_org, p_responsavel_id, 'debito', 'outro',
         'Dívida assumida (cedida por ' || COALESCE(v_titular.nome, '—') || ')',
         v_saldo, current_date, 'pendente', v_acordo);
    ELSE
      INSERT INTO public.conta_movimentos
        (org_id, entidade_id, tipo, valor, origem, contrato_id, acordo_id, descricao)
      VALUES
        (v_org, p_responsavel_id, 'debito', v_saldo, 'cessao', v_cob.contrato_id, v_acordo,
         'Dívida assumida (cedida por ' || COALESCE(v_titular.nome, '—') || ')');
    END IF;

    UPDATE public.acordos_pagamento SET cessao_aplicada = true WHERE id = v_acordo;
  END IF;

  RETURN v_acordo;
END;
$$;

-- 2) acordo_parcela_registar_pagamento — credita corretamente o motorista.
--    O recibo tem sempre de ser gravado em nome do TITULAR (FK), mas um
--    débito de ajuste anula o crédito automático que esse INSERT lança ao
--    titular (que já estava a zero desde a cessão), e o crédito real vai
--    para motorista_financeiro.
CREATE OR REPLACE FUNCTION public.acordo_parcela_registar_pagamento(
  p_parcela_id           uuid,
  p_valor                numeric(12,2),
  p_data                 date,
  p_metodo               text,
  p_entidade_id          uuid,
  p_contrato_id          uuid,
  p_cobranca_id          uuid,
  p_descricao            text,
  p_tem_documento_fiscal boolean,
  p_payload              jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parcela          public.acordo_parcelas%ROWTYPE;
  v_recibo_id        uuid;
  v_acordo_papel     text;
  v_acordo_motorista uuid;
  v_acordo_titular   uuid;
  v_entidade_recibo  uuid;
BEGIN
  SELECT * INTO v_parcela FROM public.acordo_parcelas WHERE id = p_parcela_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.';
  END IF;

  IF NOT COALESCE(
    v_parcela.org_id = public.get_current_org_id() AND public.has_renting_faturacao_access(),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registar pagamento nesta parcela.';
  END IF;

  IF v_parcela.recibo_id IS NOT NULL
     OR v_parcela.estado NOT IN ('agendada', 'avisada', 'vencida') THEN
    RAISE EXCEPTION 'Esta parcela já tem um pagamento registado ou não está aberta a pagamento (estado: %).', v_parcela.estado;
  END IF;

  -- Responsável lido do PRÓPRIO acordo — nunca confiado ao chamador.
  SELECT responsavel_papel, responsavel_motorista_id, titular_id
    INTO v_acordo_papel, v_acordo_motorista, v_acordo_titular
    FROM public.acordos_pagamento WHERE id = v_parcela.acordo_id;

  v_entidade_recibo := CASE WHEN v_acordo_papel = 'motorista' THEN v_acordo_titular ELSE p_entidade_id END;

  INSERT INTO public.recibos (
    org_id, entidade_id, contrato_id, valor, data_recibo, metodo, referencia, observacoes, estado
  ) VALUES (
    v_parcela.org_id, v_entidade_recibo, p_contrato_id, p_valor, p_data, p_metodo,
    p_cobranca_id::text, p_descricao, 'ativo'
  ) RETURNING id INTO v_recibo_id;

  IF v_acordo_papel = 'motorista' THEN
    INSERT INTO public.conta_movimentos
      (org_id, entidade_id, tipo, valor, origem, contrato_id, acordo_id, recibo_id, descricao)
    VALUES
      (v_parcela.org_id, v_acordo_titular, 'debito', p_valor, 'ajuste', p_contrato_id,
       v_parcela.acordo_id, v_recibo_id,
       'Ajuste — dívida desta parcela é do motorista responsável, não do titular');

    INSERT INTO public.motorista_financeiro
      (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, acordo_id)
    VALUES
      (v_parcela.org_id, v_acordo_motorista, 'credito', 'outro',
       'Pagamento da parcela ' || v_parcela.numero, p_valor, p_data, 'pago', v_parcela.acordo_id);
  END IF;

  UPDATE public.acordo_parcelas
     SET estado = 'liquidacao_pendente', recibo_id = v_recibo_id
   WHERE id = p_parcela_id;

  IF NOT p_tem_documento_fiscal THEN
    PERFORM public.acordo_parcela_liquidar(p_parcela_id, NULL);
    RETURN jsonb_build_object('recibo_id', v_recibo_id, 'estado', 'paga');
  END IF;

  INSERT INTO public.faturacao_outbox (
    org_id, tipo, idempotency_key, parcela_id, payload, estado, started_at
  ) VALUES (
    v_parcela.org_id, 'RC', 'RC:parcela:' || p_parcela_id::text, p_parcela_id, p_payload, 'em_curso', now()
  );

  RETURN jsonb_build_object('recibo_id', v_recibo_id, 'estado', 'liquidacao_pendente');
END;
$$;

-- 3) acordo_parcela_reverter_pagamento — reverte simetricamente o lado do
--    motorista quando o recibo (gravado em nome do titular) é anulado: o
--    trigger normal de recibos vai debitar o titular (estornando o crédito
--    automático) — isto repõe o ajuste (credita o titular de volta a zero)
--    e devolve a dívida ao motorista.
CREATE OR REPLACE FUNCTION public.acordo_parcela_reverter_pagamento(p_recibo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parcela          public.acordo_parcelas%ROWTYPE;
  v_acordo_papel     text;
  v_acordo_motorista uuid;
  v_acordo_titular   uuid;
  v_valor_recibo     numeric(12,2);
  v_contrato_id      uuid;
BEGIN
  SELECT * INTO v_parcela FROM public.acordo_parcelas WHERE recibo_id = p_recibo_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT COALESCE(
    v_parcela.org_id = public.get_current_org_id() AND public.has_renting_faturacao_access(),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para reverter esta parcela.';
  END IF;

  SELECT responsavel_papel, responsavel_motorista_id, titular_id
    INTO v_acordo_papel, v_acordo_motorista, v_acordo_titular
    FROM public.acordos_pagamento WHERE id = v_parcela.acordo_id;

  IF v_acordo_papel = 'motorista' THEN
    SELECT valor, contrato_id INTO v_valor_recibo, v_contrato_id
      FROM public.recibos WHERE id = p_recibo_id;

    INSERT INTO public.conta_movimentos
      (org_id, entidade_id, tipo, valor, origem, contrato_id, acordo_id, recibo_id, descricao)
    VALUES
      (v_parcela.org_id, v_acordo_titular, 'credito', v_valor_recibo, 'ajuste', v_contrato_id,
       v_parcela.acordo_id, p_recibo_id, 'Ajuste — reversão (recibo anulado, dívida volta ao motorista)');

    INSERT INTO public.motorista_financeiro
      (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, acordo_id)
    VALUES
      (v_parcela.org_id, v_acordo_motorista, 'debito', 'outro',
       'Estorno de pagamento (recibo anulado) — parcela ' || v_parcela.numero,
       v_valor_recibo, current_date, 'pendente', v_parcela.acordo_id);
  END IF;

  UPDATE public.acordo_parcelas
     SET estado = CASE WHEN data_vencimento < current_date THEN 'vencida' ELSE 'agendada' END,
         recibo_id = NULL, invoice_rc_id = NULL, pago_em = NULL
   WHERE id = v_parcela.id;

  UPDATE public.faturacao_outbox
     SET estado = 'falhado',
         ultimo_erro = 'Recibo anulado manualmente — idempotency key libertada para nova tentativa',
         idempotency_key = idempotency_key || ':anulado:' || id::text
   WHERE parcela_id = v_parcela.id
     AND estado IN ('pendente', 'em_curso', 'sucesso');
END; $$;

COMMENT ON FUNCTION public.acordo_criar(uuid, text, uuid, jsonb, text, smallint, smallint, text) IS
  'Cria um acordo de pagamento, as suas parcelas e (se responsável ≠ titular) os '
  'dois movimentos de cessão de dívida — tudo numa só transação. Suporta motorista '
  '(TVDE) como responsável desde 30/07/2026.';

COMMENT ON FUNCTION public.acordo_parcela_registar_pagamento(uuid, numeric, date, text, uuid, uuid, uuid, text, boolean, jsonb) IS
  'Registo atómico do pagamento de uma parcela. Quando o responsável é um motorista, '
  'credita motorista_financeiro (não recibos.entidade_id, que só aceita clientes) e '
  'lança um ajuste que anula o crédito automático ao titular.';

COMMENT ON FUNCTION public.acordo_parcela_reverter_pagamento(uuid) IS
  'Reabre uma parcela e retira a outbox associada. Quando o responsável é um '
  'motorista, reverte também o ajuste ao titular e devolve a dívida a '
  'motorista_financeiro.';
