-- supabase/migrations/20260724100004_acordos_crons.sql
-- ============================================================
-- Manutenção diária dos acordos + agendamento dos workers
-- ============================================================

-- Passos ③④⑤ do worker diário em SQL: são varrimentos de conjunto, muito mais
-- baratos aqui do que em round-trips a partir do Deno.
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
                            WHERE p.acordo_id = a.id AND p.estado = 'paga'), 0)) >= 0.005
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

-- ── Crons ────────────────────────────────────────────────────────────────
-- 06:00 UTC dá folga suficiente em qualquer estação para que o cálculo de
-- "hoje" em Europe/Lisbon (feito dentro do worker) não escorregue um dia.
SELECT cron.schedule(
  'faturacao-outbox-drain',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/faturacao-outbox-drain',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'acordos-parcelas-diario',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/acordos-parcelas-diario',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
