-- ============================================================
-- Fila dedicada + throttle para o sync automático do Via Verde
-- ============================================================
-- Problema: via-verde-scheduled-sync disparava robot-execute em paralelo
-- via Promise.all sem qualquer limite. Toda integração nova cai no mesmo
-- slot por omissão (Segunda 04:00), então à medida que mais orgs ativam o
-- sync automático, mais colidem no mesmo instante — arriscando ultrapassar
-- a concorrência do plano Apify dedicado do Via Verde.
--
-- Solução: via-verde-scheduled-sync passa a ENFILEIRAR em via_verde_sync_queue
-- em vez de disparar diretamente; uma função de drain (via-verde-sync-drain,
-- chamada a cada 5 min por cron) reclama até MAX_CONCURRENT linhas pendentes
-- de cada vez. Uma linha só fica "completed"/"failed" quando o robot-webhook
-- recebe o callback real do Apify — não quando o pedido de arranque responde
-- (isso só significa "aceite", o scraping demora minutos).
-- ============================================================

CREATE TABLE public.via_verde_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  periodo_inicio date,
  periodo_fim date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text
);

-- No máximo uma linha ativa (pending/running) por integração — torna o
-- dedupe no enqueue seguro por construção (apanhar 23505 em vez de um
-- SELECT-antes-de-INSERT com race) e garante que o robot-webhook, ao
-- fechar por integracao_id, nunca tem ambiguidade sobre qual linha fechar.
CREATE UNIQUE INDEX idx_via_verde_sync_queue_one_active
  ON public.via_verde_sync_queue (integracao_id)
  WHERE status IN ('pending', 'running');

CREATE INDEX idx_via_verde_sync_queue_status_created
  ON public.via_verde_sync_queue (status, created_at);

ALTER TABLE public.via_verde_sync_queue ENABLE ROW LEVEL SECURITY;

-- Só leitura para admins da própria org (diferente do sync_queue original,
-- que não tinha org_id na RLS e deixava um admin ver a fila de outras orgs).
CREATE POLICY "mt_via_verde_sync_queue_select" ON public.via_verde_sync_queue
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

CREATE POLICY "Service role full access to via_verde_sync_queue" ON public.via_verde_sync_queue
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Claim atómico ────────────────────────────────────────────────────────
-- FOR UPDATE SKIP LOCKED sozinho só impede duas invocações agarrarem a
-- MESMA linha — não impede que duas invocações sobrepostas, cada uma vendo
-- "há folga", reclamem em conjunto mais do que p_max. pg_try_advisory_xact_lock
-- serializa a contagem+claim entre invocações do drain que se sobreponham.
CREATE OR REPLACE FUNCTION public.via_verde_sync_queue_claim(p_max integer)
RETURNS SETOF public.via_verde_sync_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_running_count integer;
  v_capacity integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('via_verde_sync_queue_claim')) THEN
    RETURN; -- outro drain já está a reclamar; tenta na próxima tick
  END IF;

  UPDATE public.via_verde_sync_queue
     SET status = 'failed',
         completed_at = now(),
         error_message = 'Timeout: execução ultrapassou 15 minutos'
   WHERE status = 'running'
     AND started_at < now() - interval '15 minutes';

  SELECT count(*) INTO v_running_count
    FROM public.via_verde_sync_queue
   WHERE status = 'running';

  v_capacity := GREATEST(p_max - v_running_count, 0);
  IF v_capacity = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.via_verde_sync_queue q
     SET status = 'running', started_at = now()
    FROM (
      SELECT id FROM public.via_verde_sync_queue
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT v_capacity
       FOR UPDATE SKIP LOCKED
    ) claimed
   WHERE q.id = claimed.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.via_verde_sync_queue_claim(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.via_verde_sync_queue_claim(integer) TO service_role;

-- ── Defaults escalonados por org ────────────────────────────────────────
-- Antes: toda integração nova ficava fixa em Segunda(1)/04:00 — todas as
-- orgs colidiam no mesmo slot assim que ativassem o sync automático sem
-- mexer manualmente nos dropdowns. Agora: escalonado por org_id via
-- hashtext() nativo (sem precisar de nenhuma função de hash própria),
-- reaproveitando o mesmo get_current_org_id() já usado no default de
-- org_id desta tabela (20260513100006_add_org_id_defaults.sql). Só se
-- aplica a inserts autenticados pelo browser (get_current_org_id() lê
-- auth.uid(), que é null sob service role) — o wizard de criação
-- (IntegracaoDialog.tsx) nunca define estes campos explicitamente, por
-- isso cobre exatamente o caminho real de criação.
ALTER TABLE public.plataformas_configuracao
  ALTER COLUMN sync_dia_semana SET DEFAULT
    COALESCE((((hashtext(get_current_org_id()::text || ':day')::bigint % 7) + 7) % 7)::smallint, 1),
  ALTER COLUMN sync_hora SET DEFAULT
    COALESCE((((hashtext(get_current_org_id()::text || ':hour')::bigint % 24) + 24) % 24)::smallint, 4);

-- ── Cron do drain ────────────────────────────────────────────────────────
-- O cron horário existente (via-verde-weekly-sync) mantém-se — só muda o
-- que a função faz (enfileira em vez de disparar). Este é novo, a cada
-- 5 min, para processar a fila com concorrência limitada.
SELECT cron.schedule(
  'via-verde-sync-drain',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/via-verde-sync-drain',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
