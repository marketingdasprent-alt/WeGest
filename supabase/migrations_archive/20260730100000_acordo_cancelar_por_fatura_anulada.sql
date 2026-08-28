-- supabase/migrations/20260730100000_acordo_cancelar_por_fatura_anulada.sql
-- ============================================================
-- Cancela o acordo de pagamento quando a fatura de origem é anulada
-- ============================================================
-- Achado ao verificar manualmente (30/07/2026): anular uma fatura com um
-- acordo de pagamento ativo (via "Anular faturação" / anularCobrancasFaturacao)
-- nunca tocava em acordos_pagamento — o acordo ficava "ativo" para sempre, a
-- apontar para uma cobrança já 'anulada', e cobranca_saldo_por_liquidar
-- continuava a devolver o valor nominal inteiro. Confirmado com 2 acordos
-- órfãos reais na BD (códigos 2 e 3, org de teste), ambos "ativo" com a
-- cobrança já 'anulada'.
--
-- Ao contrário de acordo_cancelar (só aceita um acordo "limpo", sem nenhuma
-- parcela paga — erro de criação do próprio acordo), esta função fecha o
-- acordo INCONDICIONALMENTE: a fatura já foi anulada, por isso já não há
-- nada a proteger — mesmo parcelas já pagas ficam canceladas.
CREATE OR REPLACE FUNCTION public.acordo_cancelar_por_fatura_anulada(p_cobranca_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_acordo public.acordos_pagamento%ROWTYPE;
BEGIN
  SELECT * INTO v_acordo FROM public.acordos_pagamento
   WHERE cobranca_id = p_cobranca_id AND estado IN ('ativo', 'incumprimento')
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT COALESCE(
    v_acordo.org_id = public.get_current_org_id() AND public.has_renting_faturacao_access(),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este acordo.';
  END IF;

  UPDATE public.acordo_parcelas
     SET estado = 'cancelada'
   WHERE acordo_id = v_acordo.id
     AND estado <> 'cancelada';

  UPDATE public.acordos_pagamento
     SET estado = 'cancelado',
         observacoes = NULLIF(
           trim(both ' | ' from COALESCE(observacoes, '') || ' | ' ||
                'Cancelado automaticamente — fatura de origem anulada.'),
           ''
         )
   WHERE id = v_acordo.id;

  -- Reversão de cessão: mesmo par crédito/débito de acordo_cancelar. O crédito
  -- à fatura original (lançado pelo chamador, em anularCobrancasFaturacao, fora
  -- desta função) já repõe o titular como se a cessão nunca tivesse acontecido
  -- SÓ quando não há cessão; havendo cessão, essa mesma linha sobre-creditaria
  -- o titular (que já tinha sido creditado na cessão) se esta reversão não
  -- devolvesse o débito em falta — e deixaria o responsável cedido a dever uma
  -- dívida cujo documento fiscal já não existe.
  IF v_acordo.cessao_aplicada THEN
    INSERT INTO public.conta_movimentos
      (org_id, entidade_id, tipo, valor, origem, contrato_id, acordo_id, descricao)
    SELECT v_acordo.org_id, v_acordo.titular_id, 'debito', v_acordo.valor_total, 'cessao',
           cc.contrato_id, v_acordo.id, 'Reversão de cessão (fatura anulada)'
      FROM public.contrato_cobrancas cc WHERE cc.id = v_acordo.cobranca_id;

    IF v_acordo.responsavel_motorista_id IS NOT NULL THEN
      INSERT INTO public.motorista_financeiro
        (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, acordo_id)
      VALUES
        (v_acordo.org_id, v_acordo.responsavel_motorista_id, 'credito', 'outro',
         'Reversão de cessão (fatura anulada)', v_acordo.valor_total, current_date, 'pendente', v_acordo.id);
    ELSE
      INSERT INTO public.conta_movimentos
        (org_id, entidade_id, tipo, valor, origem, contrato_id, acordo_id, descricao)
      SELECT v_acordo.org_id, v_acordo.responsavel_cliente_id, 'credito', v_acordo.valor_total, 'cessao',
             cc.contrato_id, v_acordo.id, 'Reversão de cessão (fatura anulada)'
        FROM public.contrato_cobrancas cc WHERE cc.id = v_acordo.cobranca_id;
    END IF;

    UPDATE public.acordos_pagamento SET cessao_aplicada = false WHERE id = v_acordo.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.acordo_cancelar_por_fatura_anulada(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acordo_cancelar_por_fatura_anulada(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.acordo_cancelar_por_fatura_anulada(uuid) IS
  'Fecha incondicionalmente o acordo de pagamento (e todas as parcelas) da '
  'cobrança indicada, quando a fatura de origem é anulada — ao contrário de '
  'acordo_cancelar, nunca recusa por já haver pagamentos registados. Reverte '
  'a cessão se aplicada. No-op silencioso se não houver acordo ativo para '
  'esta cobrança.';
