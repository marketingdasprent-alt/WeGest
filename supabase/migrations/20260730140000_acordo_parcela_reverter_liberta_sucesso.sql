-- supabase/migrations/20260730140000_acordo_parcela_reverter_liberta_sucesso.sql
-- ============================================================
-- Reverter pagamento também liberta a idempotency_key de um RC já emitido
-- ============================================================
-- Achado ao testar manualmente (D2→D3, 30/07/2026): registar pagamento,
-- anular esse recibo e tentar registar de novo dava
-- "duplicate key value violates unique constraint uq_faturacao_outbox_idk".
--
-- Causa: acordo_parcela_reverter_pagamento só retirava (com sufixo
-- ':anulado:<id>') linhas da outbox em estado 'pendente'/'em_curso' — o
-- caso de uma tentativa que nunca chegou a terminar. Mas quando o RC tinha
-- sido emitido COM SUCESSO (outbox em 'sucesso') e só DEPOIS o recibo é
-- anulado manualmente, essa linha nunca era tocada — ficava para sempre
-- com a chave 'RC:parcela:<id>' original, bloqueando qualquer tentativa
-- nova sobre a mesma parcela para sempre.
--
-- Inclui agora 'sucesso' na mesma retirada. Idempotente e aditiva — só
-- muda a lista de estados apanhados pelo UPDATE.
CREATE OR REPLACE FUNCTION public.acordo_parcela_reverter_pagamento(p_recibo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_parcela public.acordo_parcelas%ROWTYPE;
BEGIN
  SELECT * INTO v_parcela FROM public.acordo_parcelas WHERE recibo_id = p_recibo_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT COALESCE(
    v_parcela.org_id = public.get_current_org_id() AND public.has_renting_faturacao_access(),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para reverter esta parcela.';
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

COMMENT ON FUNCTION public.acordo_parcela_reverter_pagamento(uuid) IS
  'Reabre uma parcela (vencida/agendada) e retira qualquer linha da '
  'faturacao_outbox ligada a ela — pendente, em_curso OU sucesso — para que '
  'uma nova tentativa de registar pagamento nunca colida com a '
  'idempotency_key antiga. No-op se o recibo não pertencer a nenhuma parcela.';
