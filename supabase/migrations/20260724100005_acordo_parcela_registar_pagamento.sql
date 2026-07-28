-- supabase/migrations/20260724100005_acordo_parcela_registar_pagamento.sql
-- ============================================================
-- RPC atómica de registo de pagamento de parcela
-- ============================================================
-- Corrige um Critical da revisão final da branch: registarPagamentoParcela
-- fazia 3 escritas HTTP separadas e não-transacionais (INSERT recibos,
-- UPDATE acordo_parcelas, INSERT faturacao_outbox) sem guarda de
-- reentrância. Um retry depois de `liquidacao_pendente` duplicava o crédito
-- na conta-corrente (2º INSERT em recibos); o UPDATE de acordo_parcelas era
-- incondicional e podia despromover uma parcela já paga.
--
-- Esta função junta as 3 escritas numa única transação, com um SELECT ...
-- FOR UPDATE a fechar a linha logo à entrada — uma segunda chamada
-- concorrente para a MESMA parcela bloqueia até a primeira COMMITar, e
-- então vê recibo_id já preenchido e é recusada. A guarda cobre tanto
-- duplo-clique (mesma sessão) como uma corrida entre duas abas/dispositivos.
--
-- O que fica de fora de propósito: falar com o provider fiscal
-- (emitirDocumento). Essa chamada é HTTP, não pode viver dentro de uma
-- transação SQL — continua no cliente (acordoPagamento.ts), depois desta
-- função devolver. As transições de estado da outbox DEPOIS dessa chamada
-- (known_failed→pendente, unknown→suspenso, sucesso) também continuam no
-- cliente, agora que a policy de UPDATE em faturacao_outbox foi corrigida
-- (migração 20260724100003, corrigida nesta mesma revisão).
CREATE OR REPLACE FUNCTION public.acordo_parcela_registar_pagamento(
  p_parcela_id           uuid,
  p_valor                numeric(12,2),
  p_data                 date,
  p_metodo               text,
  p_entidade_id          uuid,
  p_contrato_id          uuid,
  p_cobranca_id          uuid,
  p_descricao            text,
  p_tem_documento_fiscal boolean,
  p_payload              jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parcela   public.acordo_parcelas%ROWTYPE;
  v_recibo_id uuid;
BEGIN
  SELECT * INTO v_parcela FROM public.acordo_parcelas WHERE id = p_parcela_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.';
  END IF;

  -- COALESCE(..., false): mesmo motivo de acordo_parcela_liquidar — sem
  -- sessão, get_current_org_id() é NULL e o guard tem de falhar fechado.
  IF NOT COALESCE(
    v_parcela.org_id = public.get_current_org_id() AND public.has_renting_faturacao_access(),
    false
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registar pagamento nesta parcela.';
  END IF;

  -- Guarda de reentrância: fecha o caminho de duplicação. Uma parcela só
  -- pode ter UM pagamento registado — nem um duplo clique nem um retry após
  -- liquidacao_pendente conseguem passar daqui para a frente.
  IF v_parcela.recibo_id IS NOT NULL OR v_parcela.estado IN ('paga', 'liquidacao_pendente') THEN
    RAISE EXCEPTION 'Esta parcela já tem um pagamento registado (recibo %).', v_parcela.recibo_id;
  END IF;

  INSERT INTO public.recibos (
    org_id, entidade_id, contrato_id, valor, data_recibo, metodo, referencia, observacoes, estado
  ) VALUES (
    v_parcela.org_id, p_entidade_id, p_contrato_id, p_valor, p_data, p_metodo,
    p_cobranca_id::text, p_descricao, 'ativo'
  ) RETURNING id INTO v_recibo_id;

  UPDATE public.acordo_parcelas
     SET estado = 'liquidacao_pendente', recibo_id = v_recibo_id
   WHERE id = p_parcela_id;

  IF NOT p_tem_documento_fiscal THEN
    -- Sem documento fiscal: liquida já, no mesmo caminho de sempre.
    PERFORM public.acordo_parcela_liquidar(p_parcela_id, NULL);
    RETURN jsonb_build_object('recibo_id', v_recibo_id, 'estado', 'paga');
  END IF;

  INSERT INTO public.faturacao_outbox (
    org_id, tipo, idempotency_key, parcela_id, payload, estado, started_at
  ) VALUES (
    v_parcela.org_id, 'RC', 'RC:parcela:' || p_parcela_id::text, p_parcela_id, p_payload, 'em_curso', now()
  );

  RETURN jsonb_build_object('recibo_id', v_recibo_id, 'estado', 'liquidacao_pendente');
END;
$$;

REVOKE ALL ON FUNCTION public.acordo_parcela_registar_pagamento(
  uuid, numeric, date, text, uuid, uuid, uuid, text, boolean, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acordo_parcela_registar_pagamento(
  uuid, numeric, date, text, uuid, uuid, uuid, text, boolean, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.acordo_parcela_registar_pagamento(
  uuid, numeric, date, text, uuid, uuid, uuid, text, boolean, jsonb
) IS
  'Registo atómico do pagamento de uma parcela: recibo + promoção a '
  'liquidacao_pendente (ou paga, se a cobrança não tiver documento fiscal) + '
  'enfileiramento na outbox, tudo numa transação com guarda de reentrância. '
  'SECURITY DEFINER com guard interno de org/permissão — não confia em RLS.';
