-- ============================================================================
-- Fila + agendamento do sync semanal da Bolt pela API oficial
-- ============================================================================
--
-- PORQUÊ UMA FILA E NÃO UM CICLO
-- São 6 empresas Bolt e cada semana pode ter dezenas de páginas de viagens
-- (limite 1000 por página em getFleetOrders). Sincronizar as 6 numa só
-- invocação arriscava estourar o tempo da edge function a meio, deixando
-- metade das contas por fazer e sem registo de que faltavam. Uma linha por
-- (integração, semana) torna cada unidade pequena, observável e repetível.
--
-- DIFERENÇA PARA A FILA DA VIA VERDE (20260723100000)
-- Lá, o robot-execute só ARRANCA o Apify e quem fecha a linha é o webhook
-- minutos depois — por isso as linhas ficam em 'running' à espera. Aqui o
-- bolt-sync-semana é síncrono: faz o trabalho e responde. O drain fecha a
-- linha na hora, com o resultado real.
--
-- HORÁRIO
-- O robô corria às 03:00 de segunda e falhava porque o portal ainda não
-- tinha fechado a semana. A API não depende disso, mas depende de as
-- tarifas estarem finalizadas (price_review), o que pode acontecer depois
-- do fecho da semana. Daí duas passagens: segunda de manhã e outra à
-- quinta. Repetir é grátis e auto-corretivo — bolt_resumo_merge_api só
-- reescreve os campos de que a API é dona e recalcula o total; as
-- campanhas e reembolsos que vieram do CSV nunca são tocados.
--
-- Sem par verão/inverno: para uma recolha semanal, uma hora de diferença
-- entre 06:00 UTC (07:00 Lisboa no verão, 06:00 no inverno) é irrelevante.
-- Os pares existentes (jobid 67/68) precisam disso porque atacam o portal
-- num horário apertado; este não.
--
-- IDEMPOTENTE E ADITIVA. Pode correr as vezes que forem precisas.
-- ============================================================================


-- ─── 1. A fila ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bolt_sync_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id  uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  org_id         uuid NOT NULL,
  periodo_inicio date NOT NULL,
  periodo_fim    date NOT NULL,
  -- Qual das 4 variantes da fórmula de ganhos_brutos_app usar. NULL = a
  -- omissão da própria função. Fica na linha para uma recalibração poder
  -- ser enfileirada sem mexer no código.
  formula_id     text,
  origem         text NOT NULL DEFAULT 'cron' CHECK (origem IN ('cron', 'manual')),
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  resultado      jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  completed_at   timestamptz,
  error_message  text
);

COMMENT ON TABLE public.bolt_sync_queue IS
  'Fila do sync semanal da Bolt pela API oficial. Uma linha = uma integração x uma semana. '
  'Enfileirada por bolt-sync-agendado (cron) ou pelo botão Atualizar; processada por bolt-sync-drain.';
COMMENT ON COLUMN public.bolt_sync_queue.resultado IS
  'Corpo devolvido por bolt-sync-semana: contagens, formula usada e as 4 variantes calculadas. '
  'E daqui que se le a calibracao sem ter de ir aos logs.';

-- No máximo uma linha activa por (integração, semana): torna o dedupe no
-- enqueue seguro por construção — apanha-se o 23505 em vez de fazer um
-- SELECT-antes-de-INSERT com corrida pelo meio. Permite ter em fila a
-- semana passada e uma semana antiga a recuperar ao mesmo tempo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bolt_sync_queue_uma_activa
  ON public.bolt_sync_queue (integracao_id, periodo_inicio)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_bolt_sync_queue_status_created
  ON public.bolt_sync_queue (status, created_at);

ALTER TABLE public.bolt_sync_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'bolt_sync_queue' AND policyname = 'mt_bolt_sync_queue_select') THEN
    CREATE POLICY "mt_bolt_sync_queue_select" ON public.bolt_sync_queue
      FOR SELECT TO authenticated
      USING (org_id = get_current_org_id() AND is_current_user_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'bolt_sync_queue' AND policyname = 'Service role full access to bolt_sync_queue') THEN
    CREATE POLICY "Service role full access to bolt_sync_queue" ON public.bolt_sync_queue
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END;
$$;


-- ─── 2. Claim atómico ────────────────────────────────────────────────────────
-- Mesmo desenho de via_verde_sync_queue_claim: FOR UPDATE SKIP LOCKED sozinho
-- só impede duas invocações agarrarem a MESMA linha, não impede que duas
-- invocações sobrepostas do drain reclamem juntas mais do que p_max. O
-- advisory lock serializa contagem+claim entre elas.

CREATE OR REPLACE FUNCTION public.bolt_sync_queue_claim(p_max integer)
RETURNS SETOF public.bolt_sync_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_running  integer;
  v_capacity integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('bolt_sync_queue_claim')) THEN
    RETURN; -- outro drain está a reclamar; fica para o próximo tick
  END IF;

  -- Uma semana grande demora minutos, não 15. Passar disto é sinal de que a
  -- invocação morreu a meio (timeout da edge function, deploy pelo meio) e a
  -- linha ficaria em 'running' para sempre a ocupar capacidade.
  UPDATE public.bolt_sync_queue
     SET status = 'failed',
         completed_at = now(),
         error_message = 'Timeout: execução ultrapassou 15 minutos'
   WHERE status = 'running'
     AND started_at < now() - interval '15 minutes';

  SELECT count(*) INTO v_running FROM public.bolt_sync_queue WHERE status = 'running';

  v_capacity := GREATEST(p_max - v_running, 0);
  IF v_capacity = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.bolt_sync_queue q
     SET status = 'running', started_at = now()
    FROM (
      SELECT id FROM public.bolt_sync_queue
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT v_capacity
       FOR UPDATE SKIP LOCKED
    ) reclamadas
   WHERE q.id = reclamadas.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.bolt_sync_queue_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bolt_sync_queue_claim(integer) TO service_role;


-- ─── 3. Cron ─────────────────────────────────────────────────────────────────
-- cron_invocar_edge é o helper do projecto (20260730165358): trata da URL e
-- da chave, em vez de as ter em texto no comando do job como os crons antigos.
-- cron.schedule é upsert por nome, portanto correr isto outra vez só reescreve.

SELECT cron.schedule(
  'bolt-weekly-enqueue',
  '0 6 * * 1',   -- Segunda, 06:00 UTC (07:00 Lisboa no verão)
  $$ SELECT public.cron_invocar_edge('bolt-weekly-enqueue', 'bolt-sync-agendado', '{}'::jsonb, 60000) $$
);

-- Segunda passagem: apanha tarifas revistas depois do fecho da semana. O
-- merge é idempotente, por isso repetir não duplica nem estraga nada.
SELECT cron.schedule(
  'bolt-weekly-enqueue-reconciliacao',
  '0 6 * * 4',   -- Quinta, 06:00 UTC
  $$ SELECT public.cron_invocar_edge('bolt-weekly-enqueue-reconciliacao', 'bolt-sync-agendado', '{}'::jsonb, 60000) $$
);

SELECT cron.schedule(
  'bolt-sync-drain',
  '*/5 * * * *',
  $$ SELECT public.cron_invocar_edge('bolt-sync-drain', 'bolt-sync-drain', '{}'::jsonb, 60000) $$
);


-- ============================================================================
-- VERIFICAÇÃO — correr depois de aplicar
-- ============================================================================
--
--   SELECT jobname, schedule, active FROM cron.job
--    WHERE jobname LIKE 'bolt-%' ORDER BY jobname;
--   -- esperado: bolt-sync-drain (*/5), bolt-weekly-enqueue (0 6 * * 1),
--   --           bolt-weekly-enqueue-reconciliacao (0 6 * * 4)
--
--   SELECT has_function_privilege('authenticated','public.bolt_sync_queue_claim(integer)','EXECUTE')
--       AS pode_authenticated;   -- tem de ser false
--
-- Estado da fila:
--
--   SELECT q.status, q.origem, q.periodo_inicio, p.nome, q.error_message,
--          q.resultado->>'formula' AS formula, q.resultado->>'motoristas' AS motoristas
--     FROM public.bolt_sync_queue q
--     JOIN public.plataformas_configuracao p ON p.id = q.integracao_id
--    ORDER BY q.created_at DESC LIMIT 20;
-- ============================================================================
