-- Recuperada de supabase_migrations.schema_migrations (versão 20260729141855).
-- Foi aplicada em produção sem ficheiro correspondente no repositório.
--
-- Seguimento de 20260729140351: acrescenta um sufixo à idempotency_key da linha
-- do outbox ao fechá-la. Sem isso, a chave continuava a colidir e uma emissão
-- posterior legítima para a mesma parcela era descartada por idempotência.
CREATE OR REPLACE FUNCTION public.acordo_parcela_reverter_pagamento(p_recibo_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parcela public.acordo_parcelas%ROWTYPE;
BEGIN
  SELECT * INTO v_parcela FROM public.acordo_parcelas WHERE recibo_id = p_recibo_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT COALESCE(
    v_parcela.org_id = public.get_current_org_id() AND public.has_renting_faturacao_access(),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para reverter esta parcela.';
  END IF;

  UPDATE public.acordo_parcelas
     SET estado = CASE WHEN data_vencimento < current_date THEN 'vencida' ELSE 'agendada' END,
         recibo_id = NULL,
         invoice_rc_id = NULL,
         pago_em = NULL
   WHERE id = v_parcela.id;

  UPDATE public.faturacao_outbox
     SET estado = 'falhado',
         ultimo_erro = 'Recibo anulado manualmente — emissão cancelada',
         idempotency_key = idempotency_key || ':anulado:' || id::text
   WHERE parcela_id = v_parcela.id AND estado IN ('pendente', 'em_curso');
END;
$$;
