-- supabase/migrations/20260729190000_acordo_parcela_reverter_retira_idk.sql
-- ============================================================
-- Fix: acordo_parcela_reverter_pagamento tinha de retirar o idempotency_key
-- ============================================================
-- Achado ao testar manualmente (2026-07-29), minutos depois de
-- 20260729180000: reverter a parcela punha a linha antiga do outbox em
-- 'falhado', mas deixava o idempotency_key ('RC:parcela:<parcela_id>') tal e
-- qual. Como a chave é UNIQUE na tabela toda (não parcial por estado), uma
-- NOVA tentativa de registar pagamento na MESMA parcela colide sempre com a
-- linha antiga ao tentar inserir com a mesma chave — mesmo já 'falhado':
-- "duplicate key value violates unique constraint uq_faturacao_outbox_idk".
--
-- A chave original ('RC:parcela:<id>') foi desenhada para o modelo original
-- (uma parcela = uma tentativa de pagamento para sempre); a própria função
-- reverter_pagamento desta migração-irmã introduziu "reabrir e tentar de
-- novo" como fluxo legítimo, sem libertar a chave para a reutilização.
--
-- Corrige aqui, não mudando o esquema de geração da chave (usado também no
-- cliente, acordoPagamento.ts) — só "aposenta" a chave da linha antiga ao
-- fechar-lhe o estado, usando o próprio id (sempre único) como sufixo.
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

  -- idempotency_key aposentado (sufixo := próprio id, sempre único) para que
  -- uma futura tentativa de pagamento na mesma parcela consiga inserir com a
  -- chave original sem colidir com esta linha já morta.
  UPDATE public.faturacao_outbox
     SET estado = 'falhado',
         ultimo_erro = 'Recibo anulado manualmente — emissão cancelada',
         idempotency_key = idempotency_key || ':anulado:' || id::text
   WHERE parcela_id = v_parcela.id AND estado IN ('pendente', 'em_curso');
END;
$$;
