-- supabase/migrations/20260730170000_cobranca_cessao_motorista_na_emissao.sql
-- ============================================================
-- Faturar contrato / Nova Fatura: ceder a dívida ao motorista já na emissão
-- ============================================================
-- Pedido explícito do utilizador (30/07/2026): "faz com que na 'nova
-- fatura' e no 'faturar contrato' também dê para alternar entre cliente e
-- motorista, e certifica-te que reflete nas contas de cada um" — a mesma
-- ideia da cessão TVDE já construída para o parcelamento
-- (20260730150000/20260730160000), agora também para uma fatura emitida
-- SEM parcelamento nenhum.
--
-- O destinatário FISCAL da fatura (contrato_cobrancas.destinatario_id/
-- destinatario_papel) nunca muda — fica sempre o cliente titular ou
-- condutor, exactamente como hoje. Confirmado contra a BD real: tanto
-- contrato_cobrancas.destinatario_id como conta_movimentos.entidade_id têm
-- FK para clientes(id) — gravar lá um id de motoristas_ativos rebentava a
-- constraint. "Ceder ao motorista" é por isso sempre uma segunda operação,
-- em cima da cobrança já criada: credita o titular (anula o débito
-- automático do trigger fn_cobranca_posta_movimento) e debita
-- motorista_financeiro pelo mesmo valor — mesmo mecanismo de
-- acordo_criar, aplicado aqui a uma cobrança avulsa em vez de a um acordo.
--
-- Nova coluna responsavel_motorista_id (em vez de inferir só do livro-
-- -razão): permite a qualquer código futuro perguntar directamente "esta
-- cobrança está cedida a um motorista?" sem ter de reconstruir a história
-- a partir de conta_movimentos/motorista_financeiro, e dá a acordo_criar
-- uma forma barata de recusar uma dupla cessão (ver guard 4 abaixo).

-- 1) Nova coluna — NULL (default) = dívida fica com o destinatário normal.
ALTER TABLE public.contrato_cobrancas
  ADD COLUMN IF NOT EXISTS responsavel_motorista_id uuid REFERENCES public.motoristas_ativos(id);

CREATE INDEX IF NOT EXISTS idx_contrato_cobrancas_responsavel_motorista
  ON public.contrato_cobrancas (responsavel_motorista_id)
  WHERE responsavel_motorista_id IS NOT NULL;

COMMENT ON COLUMN public.contrato_cobrancas.responsavel_motorista_id IS
  'Motorista TVDE responsável pela dívida desta cobrança, cedida no '
  'momento da emissão (Nova Fatura / Faturar contrato) — NÃO é o '
  'destinatário fiscal (esse continua sempre em destinatario_id/'
  'destinatario_papel, que tem FK para clientes e é imutável por SAF-T). '
  'NULL = a dívida fica com o destinatário normal.';

-- 2) Imutável após emitida/paga — mesma razão SAF-T das outras colunas já
--    protegidas por esta função (valores, período, destinatário).
CREATE OR REPLACE FUNCTION public.fn_contrato_cobranca_protege()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();

  IF OLD.estado IN ('emitida', 'paga') THEN
    IF NEW.valor_sem_iva    IS DISTINCT FROM OLD.valor_sem_iva
    OR NEW.taxa_iva         IS DISTINCT FROM OLD.taxa_iva
    OR NEW.periodo_de       IS DISTINCT FROM OLD.periodo_de
    OR NEW.periodo_ate      IS DISTINCT FROM OLD.periodo_ate
    OR NEW.destinatario_id  IS DISTINCT FROM OLD.destinatario_id THEN
      RAISE EXCEPTION
        'Cobrança já emitida — valores, período e destinatário são imutáveis (SAF-T).';
    END IF;
    -- responsavel_motorista_id É permitido mudar de NULL -> um id (a
    -- própria cessão, feita por cobranca_ceder_a_motorista logo a seguir à
    -- emissão) mas nunca depois de já preenchido — isso seria re-ceder ou
    -- reverter por fora dos dois RPCs dedicados, que fazem sempre os
    -- lançamentos de conta-corrente a acompanhar.
    IF OLD.responsavel_motorista_id IS NOT NULL
       AND NEW.responsavel_motorista_id IS DISTINCT FROM OLD.responsavel_motorista_id THEN
      RAISE EXCEPTION
        'Esta cobrança já foi cedida a um motorista — use a reversão dedicada, não uma edição direta.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) RPC: ceder a dívida de uma cobrança já emitida a um motorista.
CREATE OR REPLACE FUNCTION public.cobranca_ceder_a_motorista(
  p_cobranca_id uuid,
  p_motorista_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cob  public.contrato_cobrancas%ROWTYPE;
  v_nome text;
BEGIN
  SELECT * INTO v_cob FROM public.contrato_cobrancas WHERE id = p_cobranca_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança não encontrada.';
  END IF;

  IF NOT COALESCE(
    v_cob.org_id = public.get_current_org_id() AND public.has_renting_faturacao_access(),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para ceder esta cobrança.';
  END IF;

  IF v_cob.responsavel_motorista_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta cobrança já foi cedida a um motorista.';
  END IF;

  -- Fatura a 0€ (cortesia): nada para ceder, sem lançamentos.
  IF v_cob.valor_total IS NULL OR v_cob.valor_total <= 0 THEN
    RETURN;
  END IF;

  SELECT nome INTO v_nome FROM public.motoristas_ativos WHERE id = p_motorista_id;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Motorista não encontrado.';
  END IF;

  UPDATE public.contrato_cobrancas
     SET responsavel_motorista_id = p_motorista_id
   WHERE id = p_cobranca_id;

  -- Credita o destinatário fiscal (anula o débito automático do trigger de
  -- emissão) — fica a 0, a dívida real passa a estar só no motorista.
  INSERT INTO public.conta_movimentos
    (org_id, entidade_id, tipo, valor, origem, cobranca_id, contrato_id, descricao)
  VALUES
    (v_cob.org_id, v_cob.destinatario_id, 'credito', v_cob.valor_total, 'cessao',
     v_cob.id, v_cob.contrato_id, 'Dívida cedida a ' || v_nome);

  INSERT INTO public.motorista_financeiro
    (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, referencia)
  VALUES
    (v_cob.org_id, p_motorista_id, 'debito', 'outro',
     'Fatura cedida — ' || COALESCE(v_cob.descricao, 'Cobrança de contrato'),
     v_cob.valor_total, current_date, 'pendente', v_cob.id::text);
END;
$$;

COMMENT ON FUNCTION public.cobranca_ceder_a_motorista(uuid, uuid) IS
  'Transfere a dívida de uma cobrança recém-emitida para um motorista '
  'TVDE: credita o destinatário fiscal (anula o débito automático) e '
  'debita motorista_financeiro pelo mesmo valor. Chamar logo a seguir à '
  'emissão (Nova Fatura / Faturar contrato), nunca depois de a cobrança já '
  'ter recibos/notas de crédito associados.';

-- 4) RPC: reverter a cessão quando a cobrança cedida é anulada. Chamada
--    best-effort por anularCobrancasFaturacao (src/lib/faturacao.ts) a
--    seguir a marcar a cobrança 'anulada' — nesse momento o trigger normal
--    já lançou o crédito de anulamento ao destinatário fiscal; sem isto,
--    esse crédito ficava a mais (o destinatário já tinha sido creditado
--    uma vez na cessão) e a dívida do motorista nunca se revertia.
CREATE OR REPLACE FUNCTION public.cobranca_reverter_cessao_motorista(p_cobranca_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cob public.contrato_cobrancas%ROWTYPE;
BEGIN
  SELECT * INTO v_cob FROM public.contrato_cobrancas WHERE id = p_cobranca_id;
  IF NOT FOUND OR v_cob.responsavel_motorista_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT COALESCE(
    v_cob.org_id = public.get_current_org_id() AND public.has_renting_faturacao_access(),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para reverter esta cessão.';
  END IF;

  INSERT INTO public.conta_movimentos
    (org_id, entidade_id, tipo, valor, origem, cobranca_id, contrato_id, descricao)
  VALUES
    (v_cob.org_id, v_cob.destinatario_id, 'debito', v_cob.valor_total, 'ajuste',
     v_cob.id, v_cob.contrato_id, 'Ajuste — anulamento de fatura cedida a motorista');

  INSERT INTO public.motorista_financeiro
    (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, referencia)
  VALUES
    (v_cob.org_id, v_cob.responsavel_motorista_id, 'credito', 'outro',
     'Estorno — fatura cedida foi anulada', v_cob.valor_total, current_date, 'pendente',
     v_cob.id::text);
END;
$$;

COMMENT ON FUNCTION public.cobranca_reverter_cessao_motorista(uuid) IS
  'Reverte cobranca_ceder_a_motorista quando a cobrança cedida é anulada: '
  'lança um ajuste ao destinatário fiscal (compensa o crédito de '
  'anulamento em duplicado) e um crédito ao motorista (devolve a dívida a '
  'zero). No-op silencioso se a cobrança nunca foi cedida.';

-- 5) acordo_criar: recusa parcelar uma cobrança já cedida a OUTRO
--    motorista, e não re-cede (nem duplica lançamentos) quando o
--    parcelamento escolhe o MESMO motorista a quem a cobrança já foi
--    cedida na emissão — nesse caso a dívida já lá está; só falta o plano
--    de parcelas.
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
  v_ja_cedido_a_este boolean;
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

  v_ja_cedido_a_este := v_cob.responsavel_motorista_id IS NOT NULL
    AND p_responsavel_papel = 'motorista'
    AND p_responsavel_id = v_cob.responsavel_motorista_id;

  IF v_cob.responsavel_motorista_id IS NOT NULL AND NOT v_ja_cedido_a_este THEN
    RAISE EXCEPTION
      'Esta fatura já foi cedida a um motorista na emissão — só é possível parcelar para esse mesmo motorista.';
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
  -- Já cedida a este mesmo motorista na emissão (v_ja_cedido_a_este): a
  -- dívida já está lá — só falta o plano de parcelas, sem novo lançamento
  -- (evitaria duplicar o crédito ao titular e a dívida do motorista).
  IF NOT v_ja_cedido_a_este
     AND NOT (p_responsavel_papel <> 'motorista' AND p_responsavel_id = v_cob.destinatario_id) THEN
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

COMMENT ON FUNCTION public.acordo_criar(uuid, text, uuid, jsonb, text, smallint, smallint, text) IS
  'Cria um acordo de pagamento, as suas parcelas e (se responsável ≠ titular, e '
  'ainda não cedida ao mesmo motorista na emissão) os dois movimentos de cessão '
  'de dívida — tudo numa só transação. Suporta motorista (TVDE) como '
  'responsável desde 30/07/2026, e recusa parcelar para um responsável '
  'diferente do motorista a quem a cobrança já foi cedida na emissão '
  '(cobranca_ceder_a_motorista).';
