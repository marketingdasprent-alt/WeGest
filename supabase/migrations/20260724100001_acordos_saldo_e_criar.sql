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

-- ── mt_motorista_fin_insert alargada para faturação ─────────────────────
-- acordo_criar autoriza-se sempre por has_renting_faturacao_access() — todos
-- os outros INSERT que faz (acordos_pagamento, acordo_parcelas,
-- conta_movimentos) já aceitam esse acesso. A policy original de
-- motorista_financeiro (20260513100005_update_rls_multitenancy.sql,
-- mt_motorista_fin_insert) só permite admin, motoristas_gestao ou
-- assistencia_tickets — um utilizador só com acesso de faturação (sem
-- nenhuma dessas três permissões) recebia um erro cru de RLS ao ceder uma
-- dívida a um motorista, e a funcionalidade de cessão a motorista ficava
-- morta para esse papel. Reproduz-se a policy tal como estava e acrescenta-se
-- a alternativa, sem tocar no gate de org_id nem nas condições já existentes.
DROP POLICY IF EXISTS "mt_motorista_fin_insert" ON public.motorista_financeiro;
CREATE POLICY "mt_motorista_fin_insert" ON public.motorista_financeiro FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
    OR public.has_renting_faturacao_access()
  ));

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

  -- TVDE fatura-se fora do WeGest (decisão de produto já tomada) — o caminho
  -- de pagamento (registarPagamentoParcela → RPC acordo_parcela_registar_
  -- pagamento → INSERT recibos) só aceita `clientes` (recibos.entidade_id
  -- referencia clientes, não motoristas_ativos). Um acordo com responsável
  -- motorista nunca conseguiria registar um pagamento (viola a FK) e nunca
  -- chegaria a 'paga'. Bloqueado aqui, na BD, e não só na UI, porque
  -- acordo_criar tem GRANT para `authenticated` — a UI não é fronteira de
  -- confiança. Nota: isto torna o ramo `p_responsavel_papel = 'motorista'`
  -- mais abaixo nesta função permanentemente morto (a INSERT em
  -- motorista_financeiro, o SELECT em motoristas_ativos) — deixado como
  -- está, sem remover, para não arriscar uma reescrita maior deste ficheiro
  -- numa correção que só precisa de bloquear, não de reestruturar.
  IF p_responsavel_papel = 'motorista' THEN
    RAISE EXCEPTION 'Cessão de dívida a motorista (TVDE) não é suportada no parcelamento — o TVDE fatura-se fora do WeGest.';
  END IF;

  -- Fatura-Recibo já nasce liquidada — não há dívida para parcelar.
  --
  -- NOTA (desvio do desenho, mesma classe do NC acima): a verificação original
  -- procurava em `invoices` (tipo='FR', status='emitida', cobranca_id=...).
  -- Mas `invoices.cobranca_id` é nullable e faturacao-emitir/index.ts grava
  -- NULL sempre que o chamador não passa cobranca_id explicitamente — um FR
  -- emitido por esse caminho passava despercebido a este EXISTS. Tal como
  -- ContratoTabFaturar.tsx (isFR) e faturacao.ts (isFaturaReciboDesc) já
  -- fazem no frontend, o sinal fiável é o PRÓPRIO descritivo da cobrança:
  -- os três fluxos que criam uma cobrança Factura-Recibo (ContratoFaturarDialog,
  -- NovaFaturaDialog, ReservaFaturarDialog) gravam sempre `descricao` a
  -- começar por "Factura-Recibo — " / "Fatura-Recibo — " no momento da
  -- criação — independente de invoices. `v_cob` já está carregado acima.
  IF v_cob.descricao ILIKE 'factura-recibo%' OR v_cob.descricao ILIKE 'fatura-recibo%' THEN
    RAISE EXCEPTION 'Faturas-Recibo (FR) já estão liquidadas e não podem ser parceladas.';
  END IF;

  -- FT emitida, para ligar como invoice_id do acordo — nunca precisa de
  -- considerar FR aqui, porque esse caso já saiu acima.
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

  -- Uma cessão cancelada não é uma cessão revertida: cancelar o acordo só
  -- muda o `estado`, não desfaz o crédito ao titular nem o débito ao
  -- responsável já lançados em conta_movimentos/motorista_financeiro. Criar
  -- um segundo acordo sobre a mesma cobrança lançaria uma SEGUNDA cessão
  -- inteira, duplicando o crédito ao titular — e cobranca_saldo_por_liquidar
  -- nunca veria essa duplicação, porque só subtrai recibos e notas de
  -- crédito, nunca movimentos de cessão.
  -- `cessao_aplicada = true` é exactamente a flag que assinala que a cessão
  -- deste acordo ainda está por reverter. Um futuro `acordo_cancelar()` há-de
  -- lançar o par crédito/débito compensatório e só então pôr
  -- `cessao_aplicada = false`, o que liberta esta guarda.
  IF EXISTS (SELECT 1 FROM public.acordos_pagamento
              WHERE cobranca_id = p_cobranca_id
                AND estado = 'cancelado' AND cessao_aplicada = true) THEN
    RAISE EXCEPTION 'Existe uma cessão de dívida por reverter nesta fatura. Reverta o acordo cancelado antes de criar um novo.';
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

GRANT EXECUTE ON FUNCTION public.acordo_criar(
  uuid, text, uuid, jsonb, text, smallint, smallint, text) TO authenticated;

COMMENT ON FUNCTION public.acordo_criar(uuid, text, uuid, jsonb, text, smallint, smallint, text) IS
  'Cria um acordo de pagamento, as suas parcelas e (se responsável ≠ titular) os dois '
  'movimentos de cessão de dívida — tudo numa só transação.';

-- ------------------------------------------------------------
-- acordo_cancelar — só para acordos "limpos" (sem pagamento registado).
-- Reverte a cessão (se aplicada) com o par crédito/débito exactamente
-- inverso ao que acordo_criar lançou, e liberta cessao_aplicada para que um
-- novo acordo sobre a mesma cobrança seja possível (ver o guard em
-- acordo_criar que bloqueia enquanto cessao_aplicada = true).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acordo_cancelar(p_acordo_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_acordo public.acordos_pagamento%ROWTYPE;
BEGIN
  SELECT * INTO v_acordo FROM public.acordos_pagamento WHERE id = p_acordo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acordo não encontrado.';
  END IF;

  -- COALESCE(..., false): mesmo motivo de acordo_parcela_liquidar — sem
  -- sessão, get_current_org_id() é NULL e o guard tem de falhar fechado.
  IF NOT COALESCE(
    v_acordo.org_id = public.get_current_org_id() AND public.has_renting_faturacao_access(),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este acordo.';
  END IF;

  IF v_acordo.estado NOT IN ('ativo', 'incumprimento') THEN
    RAISE EXCEPTION 'Só é possível cancelar um acordo ativo ou em incumprimento (estado atual: %).', v_acordo.estado;
  END IF;

  -- Nenhuma parcela pode já ter dinheiro registado — cancelar um acordo com
  -- pagamentos em curso deixaria recibos/liquidacao_pendente órfãos, sem
  -- acordo vivo a que pertencer. Cancela-se só um acordo "limpo" (erro de
  -- criação); um acordo com progresso real fica fora do âmbito desta correção.
  IF EXISTS (
    SELECT 1 FROM public.acordo_parcelas
     WHERE acordo_id = p_acordo_id AND estado NOT IN ('agendada', 'avisada', 'vencida')
  ) THEN
    RAISE EXCEPTION 'Não é possível cancelar: existem parcelas com pagamento já registado.';
  END IF;

  UPDATE public.acordos_pagamento SET estado = 'cancelado' WHERE id = p_acordo_id;
  UPDATE public.acordo_parcelas SET estado = 'cancelada' WHERE acordo_id = p_acordo_id;

  IF v_acordo.cessao_aplicada THEN
    INSERT INTO public.conta_movimentos
      (org_id, entidade_id, tipo, valor, origem, contrato_id, acordo_id, descricao)
    SELECT v_acordo.org_id, v_acordo.titular_id, 'debito', v_acordo.valor_total, 'cessao',
           cc.contrato_id, v_acordo.id, 'Reversão de cessão (acordo cancelado)'
      FROM public.contrato_cobrancas cc WHERE cc.id = v_acordo.cobranca_id;

    IF v_acordo.responsavel_motorista_id IS NOT NULL THEN
      INSERT INTO public.motorista_financeiro
        (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, acordo_id)
      VALUES
        (v_acordo.org_id, v_acordo.responsavel_motorista_id, 'credito', 'outro',
         'Reversão de cessão (acordo cancelado)', v_acordo.valor_total, current_date, 'pendente', v_acordo.id);
    ELSE
      INSERT INTO public.conta_movimentos
        (org_id, entidade_id, tipo, valor, origem, contrato_id, acordo_id, descricao)
      SELECT v_acordo.org_id, v_acordo.responsavel_cliente_id, 'credito', v_acordo.valor_total, 'cessao',
             cc.contrato_id, v_acordo.id, 'Reversão de cessão (acordo cancelado)'
        FROM public.contrato_cobrancas cc WHERE cc.id = v_acordo.cobranca_id;
    END IF;

    UPDATE public.acordos_pagamento SET cessao_aplicada = false WHERE id = p_acordo_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.acordo_cancelar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acordo_cancelar(uuid) TO authenticated;

COMMENT ON FUNCTION public.acordo_cancelar(uuid) IS
  'Cancela um acordo sem pagamentos registados e reverte a cessão de dívida '
  'se foi aplicada (par crédito/débito inverso ao de acordo_criar). Recusa se '
  'qualquer parcela já tiver pagamento registado.';
