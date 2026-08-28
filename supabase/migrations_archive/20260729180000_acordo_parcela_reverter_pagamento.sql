-- supabase/migrations/20260729180000_acordo_parcela_reverter_pagamento.sql
-- ============================================================
-- Reverte a parcela do acordo quando o recibo é anulado
-- ============================================================
-- Achado ao testar manualmente (2026-07-29): anular um recibo em Administrativo
-- → Faturação (FaturacaoTab.confirmarAnular) só mexia em `recibos` e
-- `contrato_cobrancas` — nunca em `acordo_parcelas` nem em `faturacao_outbox`.
-- Resultado: a parcela ficava presa em 'liquidacao_pendente'/'paga' com
-- `recibo_id` a apontar para um recibo já anulado, e a linha do outbox
-- continuava 'pendente' — o próximo ciclo do drain (5 em 5 min, cron já activo)
-- tentaria emitir um RC para um pagamento que já foi anulado.
--
-- Esta função só actua quando o recibo pertence de facto a uma parcela de
-- acordo (SELECT sem FOUND → no-op); a maioria dos recibos anulados por este
-- ecrã não têm nada a ver com parcelamento.
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

  -- COALESCE(..., false): sem sessão, get_current_org_id() é NULL — falha fechado
  -- (mesmo padrão de acordo_parcela_liquidar/registar_pagamento).
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

  -- Pára o outbox: sem isto o próximo drain (5 em 5 min) tentava emitir um RC
  -- para um pagamento que acabou de ser anulado. 'falhado' é o único estado
  -- terminal que o CHECK de faturacao_outbox aceita além de 'sucesso'.
  UPDATE public.faturacao_outbox
     SET estado = 'falhado', ultimo_erro = 'Recibo anulado manualmente — emissão cancelada'
   WHERE parcela_id = v_parcela.id AND estado IN ('pendente', 'em_curso');
END;
$$;

REVOKE ALL ON FUNCTION public.acordo_parcela_reverter_pagamento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acordo_parcela_reverter_pagamento(uuid) TO authenticated;

COMMENT ON FUNCTION public.acordo_parcela_reverter_pagamento(uuid) IS
  'Chamada depois de anular um recibo (FaturacaoTab.confirmarAnular): se o '
  'recibo pertencer a uma parcela de acordo, reabre-a (vencida/agendada '
  'conforme a data) e fecha a linha do outbox associada para não reemitir. '
  'No-op se o recibo não pertencer a nenhuma parcela.';
