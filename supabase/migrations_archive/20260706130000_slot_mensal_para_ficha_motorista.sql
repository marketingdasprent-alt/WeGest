-- ============================================================
-- Mensalidade de SLOT → dívida na ficha do motorista
-- ============================================================
-- As mensalidades de slot passam a ser lançadas como DÉBITO pendente em
-- motorista_financeiro (ficha financeira do motorista), em vez de cobranças
-- para faturação em contrato_cobrancas.
--
-- O helper fn_slot_inserir_cobranca mantém a assinatura, por isso o trigger
-- de entrada (trg_slot_cobranca_entrada) e o cron mensal
-- (gerar_cobrancas_slot_mensais) continuam a funcionar sem alterações —
-- só o destino do lançamento muda.
--
-- Idempotente. Aplicar à mão no SQL editor.
-- ============================================================

-- 1) Idempotência dos lançamentos: um débito por (reserva, período),
--    identificado pela referência 'slot:{reserva_id}:{de}:{ate}'.
CREATE UNIQUE INDEX IF NOT EXISTS motorista_financeiro_slot_ref_unico
  ON public.motorista_financeiro (referencia)
  WHERE categoria = 'slot_mensal';

-- 2) Reescrever o helper: lança débito na ficha do motorista.
CREATE OR REPLACE FUNCTION public.fn_slot_inserir_cobranca(
  p_reserva     public.reservas,
  p_de          date,
  p_ate         date,
  p_valor_bruto numeric,
  p_descricao   text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rowcount integer;
BEGIN
  IF p_reserva.condutor_id IS NULL OR p_valor_bruto IS NULL OR p_valor_bruto <= 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.motorista_financeiro (
    org_id, motorista_id, tipo, categoria, descricao,
    valor, data_movimento, status, referencia
  )
  VALUES (
    p_reserva.org_id, p_reserva.condutor_id, 'debito', 'slot_mensal', p_descricao,
    p_valor_bruto, p_de, 'pendente',
    'slot:' || p_reserva.id || ':' || p_de || ':' || p_ate
  )
  ON CONFLICT (referencia) WHERE categoria = 'slot_mensal'
  DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  RETURN v_rowcount;
END;
$$;

-- 3) Converter as cobranças de slot já geradas e ainda por tratar
--    (pendentes, sem fatura emitida) em débitos na ficha — e anulá-las
--    para não aparecerem mais no card "Mensalidade Slot" do Resumo.
WITH pendentes AS (
  SELECT cc.id, cc.org_id, cc.reserva_id, cc.periodo_de, cc.periodo_ate,
         cc.descricao, cc.valor_sem_iva, cc.taxa_iva, r.condutor_id
  FROM public.contrato_cobrancas cc
  JOIN public.reservas r ON r.id = cc.reserva_id
  WHERE cc.tipo_cobranca = 'slot_mensal'
    AND cc.estado = 'pendente'
    AND cc.documento_externo_ref IS NULL
    AND r.condutor_id IS NOT NULL
),
ins AS (
  INSERT INTO public.motorista_financeiro (
    org_id, motorista_id, tipo, categoria, descricao,
    valor, data_movimento, status, referencia
  )
  SELECT p.org_id, p.condutor_id, 'debito', 'slot_mensal',
         COALESCE(p.descricao, 'Mensalidade de slot'),
         ROUND(p.valor_sem_iva * (1 + COALESCE(p.taxa_iva, 23) / 100.0), 2),
         p.periodo_de, 'pendente',
         'slot:' || p.reserva_id || ':' || p.periodo_de || ':' || p.periodo_ate
  FROM pendentes p
  ON CONFLICT (referencia) WHERE categoria = 'slot_mensal'
  DO NOTHING
  RETURNING referencia
)
UPDATE public.contrato_cobrancas cc
SET estado = 'anulada'
FROM pendentes p
WHERE cc.id = p.id;
