-- Recuperada de supabase_migrations.schema_migrations (versão 20260729140351).
-- Foi aplicada em produção sem ficheiro correspondente no repositório.
--
-- Nota de ordem: a migração seguinte (20260729141855) volta a substituir esta
-- função para acrescentar o sufixo à idempotency_key. As duas têm de existir e
-- por esta ordem — um replay que só tivesse a segunda dava o mesmo resultado,
-- mas guardar as duas mantém o histórico fiel ao que produção aplicou.
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
