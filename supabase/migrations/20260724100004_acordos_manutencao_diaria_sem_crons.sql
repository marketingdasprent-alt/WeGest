-- supabase/migrations/20260724100004_acordos_crons.sql (parte 1/2 — só a função)
-- Os 2 cron.schedule() deste ficheiro (drain a cada 5min, worker diário às 6h)
-- ficam de fora DE PROPÓSITO nesta aplicação — ligados só depois do utilizador
-- dar OK final para ir para o ar. Aplicados numa migração separada mais tarde.
-- ============================================================
-- Manutenção diária dos acordos (função apenas — sem agendamento ainda)
-- ============================================================

CREATE OR REPLACE FUNCTION public.acordos_manutencao_diaria(p_hoje date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_incumprimentos int;
  v_liquidados     int;
  v_revisao        int;
BEGIN
  -- ③ Incumprimento: 2+ parcelas vencidas, ou 1 vencida há mais de 30 dias.
  WITH alvo AS (
    SELECT a.id
      FROM public.acordos_pagamento a
     WHERE a.estado = 'ativo'
       AND (
         (SELECT count(*) FROM public.acordo_parcelas p
           WHERE p.acordo_id = a.id AND p.estado = 'vencida') >= 2
         OR EXISTS (SELECT 1 FROM public.acordo_parcelas p
                     WHERE p.acordo_id = a.id AND p.estado = 'vencida'
                       AND p.data_vencimento < p_hoje - 30)
       )
  )
  UPDATE public.acordos_pagamento a SET estado = 'incumprimento'
    FROM alvo WHERE a.id = alvo.id;
  GET DIAGNOSTICS v_incumprimentos = ROW_COUNT;

  -- ④ Liquidados (rede de segurança; o caminho normal é acordo_parcela_liquidar).
  WITH alvo AS (
    SELECT a.id FROM public.acordos_pagamento a
     WHERE a.estado IN ('ativo','incumprimento')
       AND NOT EXISTS (SELECT 1 FROM public.acordo_parcelas p
                        WHERE p.acordo_id = a.id AND p.estado NOT IN ('paga','cancelada'))
  )
  UPDATE public.acordos_pagamento a SET estado = 'liquidado'
    FROM alvo WHERE a.id = alvo.id;
  GET DIAGNOSTICS v_liquidados = ROW_COUNT;

  -- ⑤ Divergência (ex.: NC emitida depois do acordo). NÃO altera valores:
  -- mexer num acordo já aceite pelo devedor é decisão de negócio, não de cron.
  WITH alvo AS (
    SELECT a.id FROM public.acordos_pagamento a
     WHERE a.estado IN ('ativo','incumprimento')
       AND a.precisa_revisao = false
       AND abs(a.valor_total - public.cobranca_saldo_por_liquidar(a.cobranca_id)
               - COALESCE((SELECT SUM(p.valor) FROM public.acordo_parcelas p
                            WHERE p.acordo_id = a.id AND p.estado IN ('paga', 'liquidacao_pendente')), 0)) >= 0.005
  )
  UPDATE public.acordos_pagamento a SET precisa_revisao = true
    FROM alvo WHERE a.id = alvo.id;
  GET DIAGNOSTICS v_revisao = ROW_COUNT;

  RETURN jsonb_build_object(
    'incumprimentos', v_incumprimentos,
    'liquidados', v_liquidados,
    'revisao', v_revisao);
END;
$$;

REVOKE ALL ON FUNCTION public.acordos_manutencao_diaria(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acordos_manutencao_diaria(date) TO service_role;

COMMENT ON FUNCTION public.acordos_manutencao_diaria(date) IS
  'Varrimento diário de acordos_pagamento: promove a incumprimento, liquida como '
  'rede de segurança e marca precisa_revisao em caso de divergência de saldo. '
  'Idempotente — deriva tudo do estado actual, nunca de "quando correu da última vez". '
  'SECURITY DEFINER restrito a service_role (chamada só pelo worker '
  'acordos-parcelas-diario via cron).';
