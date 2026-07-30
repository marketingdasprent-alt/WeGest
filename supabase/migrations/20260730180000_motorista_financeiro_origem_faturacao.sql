-- supabase/migrations/20260730180000_motorista_financeiro_origem_faturacao.sql
-- ============================================================
-- Movimentos do motorista vindos da faturação: origem explícita
-- ============================================================
-- Pedido do utilizador (30/07/2026): na aba Financeiro do motorista, os
-- movimentos que vêm de uma fatura (dívida cedida, pagamento de parcela,
-- estornos) não podem ter as ações de "marcar como pago" / "cancelar" /
-- "editar" — para pagar ou alterar tem de ser no contrato/fatura.
--
-- Não é só cosmético: marcar "Fatura cedida — …" como paga à mão punha o
-- saldo do motorista a dizer que a dívida estava liquidada enquanto a
-- fatura continuava por liquidar em contrato_cobrancas/recibos — as duas
-- fontes deixavam de bater, sem nada a assinalá-lo.
--
-- Para a UI poder distinguir estes movimentos de forma fiável, a origem
-- passa a ser explícita numa coluna (mesmo padrão das colunas dano_id /
-- reparacao_id / acordo_id que já existem nesta tabela) em vez de ficar
-- escondida dentro do texto livre de `referencia`.

ALTER TABLE public.motorista_financeiro
  ADD COLUMN IF NOT EXISTS cobranca_id uuid REFERENCES public.contrato_cobrancas(id);

CREATE INDEX IF NOT EXISTS idx_motorista_financeiro_cobranca
  ON public.motorista_financeiro (cobranca_id)
  WHERE cobranca_id IS NOT NULL;

COMMENT ON COLUMN public.motorista_financeiro.cobranca_id IS
  'Cobrança que originou este movimento, quando a dívida foi cedida ao '
  'motorista na emissão (cobranca_ceder_a_motorista). Junto com acordo_id '
  'marca os movimentos geridos pela faturação — a UI não deixa marcá-los '
  'como pagos, cancelá-los nem editá-los à mão.';

-- Passa a gravar cobranca_id (em vez de esconder o id em `referencia`,
-- que é texto livre mostrado ao utilizador e aparecia como um UUID cru).
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
    (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, cobranca_id)
  VALUES
    (v_cob.org_id, p_motorista_id, 'debito', 'outro',
     'Fatura cedida — ' || COALESCE(v_cob.descricao, 'Cobrança de contrato'),
     v_cob.valor_total, current_date, 'pendente', v_cob.id);
END;
$$;

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
    (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, cobranca_id)
  VALUES
    (v_cob.org_id, v_cob.responsavel_motorista_id, 'credito', 'outro',
     'Estorno — fatura cedida foi anulada', v_cob.valor_total, current_date, 'pendente',
     v_cob.id);
END;
$$;
