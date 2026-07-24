-- supabase/migrations/20260724100001_acordos_saldo_e_criar.sql
-- ============================================================
-- Saldo por liquidar + criação transacional do acordo (com cessão de dívida)
-- ============================================================

-- ── Cessão de dívida nos dois livros razão ──────────────────────────────
-- conta_movimentos só aceita `clientes`; motoristas TVDE têm livro próprio.
-- O crédito vai sempre para conta_movimentos (o titular é sempre cliente);
-- o débito vai para o livro do responsável. `acordo_id` costura os dois lados.
--
-- NOTA (desvio do desenho): o CHECK de `origem` já tinha sido alargado pela
-- migração 20260613000001_notas_credito.sql para incluir 'nota_credito'. Um
-- ALTER que reescrevesse o CHECK só com ('cobranca','recibo','dano','ajuste',
-- 'cessao') apagava silenciosamente essa origem e partia qualquer nota de
-- crédito nova. Mantemos todos os valores já aceites e acrescentamos 'cessao'.
ALTER TABLE public.conta_movimentos DROP CONSTRAINT IF EXISTS conta_movimentos_origem_check;
ALTER TABLE public.conta_movimentos ADD CONSTRAINT conta_movimentos_origem_check
  CHECK (origem IN ('cobranca','recibo','dano','ajuste','nota_credito','cessao'));

ALTER TABLE public.conta_movimentos
  ADD COLUMN IF NOT EXISTS acordo_id uuid REFERENCES public.acordos_pagamento(id) ON DELETE SET NULL;
ALTER TABLE public.motorista_financeiro
  ADD COLUMN IF NOT EXISTS acordo_id uuid REFERENCES public.acordos_pagamento(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conta_movimentos_acordo
  ON public.conta_movimentos (acordo_id) WHERE acordo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_motorista_financeiro_acordo
  ON public.motorista_financeiro (acordo_id) WHERE acordo_id IS NOT NULL;

-- Saldo ainda por liquidar de uma cobrança:
--   total − recibos ativos que a referenciam − notas de crédito ativas.
--
-- NOTA (desvio do desenho): o desenho original subtraía
-- `invoices WHERE tipo = 'NC' AND status = 'emitida'`. Essa tabela é o
-- espelho local dos documentos fiscais emitidos no KeyInvoice — não é onde
-- o crédito de uma NC é contabilizado. O crédito efetivo vive em
-- `notas_credito` (estado = 'ativo'), que é exatamente o que
-- ContratoTabFaturar.tsx já usa para calcular `saldoPagar`
-- (total − recibos ativos − notas_credito ativas — ver linhas 475-495 desse
-- ficheiro). Esta função espelha esse cálculo para não divergir do que o
-- utilizador já vê no ecrã de faturação.
CREATE OR REPLACE FUNCTION public.cobranca_saldo_por_liquidar(p_cobranca_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT GREATEST(
    COALESCE((SELECT valor_total FROM public.contrato_cobrancas WHERE id = p_cobranca_id), 0)
    - COALESCE((SELECT SUM(valor) FROM public.recibos
                 WHERE referencia = p_cobranca_id::text AND estado = 'ativo'), 0)
    - COALESCE((SELECT SUM(valor) FROM public.notas_credito
                 WHERE cobranca_id = p_cobranca_id AND estado = 'ativo'), 0),
    0)::numeric(12,2);
$$;

GRANT EXECUTE ON FUNCTION public.cobranca_saldo_por_liquidar(uuid) TO authenticated;

COMMENT ON FUNCTION public.cobranca_saldo_por_liquidar(uuid) IS
  'Saldo ainda por liquidar de uma cobrança: total − recibos ativos − notas de '
  'crédito ativas. Espelha o cálculo de saldoPagar do ecrã de faturação.';

-- ------------------------------------------------------------
-- acordo_criar — tudo num só COMMIT.
-- Nunca existe acordo sem parcelas, nem cessão com um só lado lançado.
-- ------------------------------------------------------------
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
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
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
  SELECT id INTO v_invoice FROM public.invoices
   WHERE cobranca_id = p_cobranca_id AND status = 'emitida' AND tipo IN ('FT','FR')
   ORDER BY created_at DESC LIMIT 1;

  IF EXISTS (SELECT 1 FROM public.invoices
              WHERE cobranca_id = p_cobranca_id AND tipo = 'FR' AND status = 'emitida') THEN
    RAISE EXCEPTION 'Faturas-Recibo (FR) já estão liquidadas e não podem ser parceladas.';
  END IF;

  v_saldo := public.cobranca_saldo_por_liquidar(p_cobranca_id);
  IF v_saldo <= 0.005 THEN
    RAISE EXCEPTION 'Esta fatura não tem saldo por liquidar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.acordos_pagamento
              WHERE cobranca_id = p_cobranca_id AND estado IN ('ativo','incumprimento')) THEN
    RAISE EXCEPTION 'Esta fatura já tem um acordo de pagamento ativo.';
  END IF;

  IF p_parcelas IS NULL OR jsonb_array_length(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'O plano tem de ter pelo menos uma parcela.';
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
  -- Só quando o responsável não é o titular. Crédito ao titular e débito ao
  -- responsável, na MESMA transação — nunca uma conta fica corrigida sem a outra.
  IF NOT (p_responsavel_papel <> 'motorista' AND p_responsavel_id = v_cob.destinatario_id) THEN
    INSERT INTO public.conta_movimentos
      (org_id, entidade_id, tipo, valor, origem, contrato_id, acordo_id, descricao)
    VALUES
      (v_org, v_cob.destinatario_id, 'credito', v_saldo, 'cessao', v_cob.contrato_id, v_acordo,
       'Dívida cedida a ' || v_resp_nome);

    IF p_responsavel_papel = 'motorista' THEN
      INSERT INTO public.motorista_financeiro
        (motorista_id, tipo, categoria, descricao, valor, data_movimento, status, acordo_id)
      VALUES
        (p_responsavel_id, 'debito', 'outro',
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

GRANT EXECUTE ON FUNCTION public.acordo_criar(
  uuid, text, uuid, jsonb, text, smallint, smallint, text) TO authenticated;

COMMENT ON FUNCTION public.acordo_criar(uuid, text, uuid, jsonb, text, smallint, smallint, text) IS
  'Cria um acordo de pagamento, as suas parcelas e (se responsável ≠ titular) os dois '
  'movimentos de cessão de dívida — tudo numa só transação.';
