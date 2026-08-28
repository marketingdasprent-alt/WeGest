
-- 1. Create sync_queue table
CREATE TABLE public.sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  plataforma text NOT NULL,
  robot_target_platform text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text
);

ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sync_queue" ON public.sync_queue
  FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role full access to sync_queue" ON public.sync_queue
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_sync_queue_status ON public.sync_queue(status);
CREATE INDEX idx_sync_queue_created_at ON public.sync_queue(created_at);

-- 2. Update manage_cron_job to also allow sync_orchestrator prefix
CREATE OR REPLACE FUNCTION public.manage_cron_job(
  p_job_name text,
  p_action text,
  p_cron_expression text DEFAULT NULL,
  p_function_url text DEFAULT NULL,
  p_anon_key text DEFAULT NULL,
  p_body text DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result bigint;
  v_exists boolean;
  v_schedule text;
BEGIN
  IF p_job_name !~ '^(bolt_sync_|robot_exec_|uber_sync_|sync_orchestrator)[a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Nome de job inválido: %', p_job_name;
  END IF;

  IF p_action = 'read' THEN
    SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = p_job_name) INTO v_exists;
    IF v_exists THEN
      SELECT schedule INTO v_schedule FROM cron.job WHERE jobname = p_job_name LIMIT 1;
      RETURN jsonb_build_object('success', true, 'exists', true, 'job_name', p_job_name, 'cron_expression', v_schedule);
    ELSE
      RETURN jsonb_build_object('success', true, 'exists', false, 'job_name', p_job_name);
    END IF;

  ELSIF p_action = 'delete' THEN
    SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = p_job_name) INTO v_exists;
    IF v_exists THEN
      PERFORM cron.unschedule(p_job_name);
      RETURN jsonb_build_object('success', true, 'action', 'deleted', 'job_name', p_job_name);
    ELSE
      RETURN jsonb_build_object('success', true, 'action', 'noop', 'job_name', p_job_name, 'message', 'Job não existia');
    END IF;

  ELSIF p_action = 'schedule' THEN
    IF p_cron_expression IS NULL OR p_function_url IS NULL OR p_anon_key IS NULL THEN
      RAISE EXCEPTION 'cron_expression, function_url e anon_key são obrigatórios para agendar';
    END IF;

    SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = p_job_name) INTO v_exists;
    IF v_exists THEN
      PERFORM cron.unschedule(p_job_name);
    END IF;

    SELECT cron.schedule(
      p_job_name,
      p_cron_expression,
      format(
        'SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:=%L::jsonb) AS request_id',
        p_function_url,
        json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || p_anon_key)::text,
        p_body
      )
    ) INTO v_result;

    RETURN jsonb_build_object('success', true, 'action', 'scheduled', 'job_name', p_job_name, 'cron_expression', p_cron_expression);
  ELSE
    RAISE EXCEPTION 'Ação inválida: %. Use "schedule", "delete" ou "read"', p_action;
  END IF;
END;
$$;

-- 3. Clean up function to remove all old individual cron jobs
CREATE OR REPLACE FUNCTION public.cleanup_old_cron_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN 
    SELECT jobname FROM cron.job 
    WHERE jobname LIKE 'bolt_sync_%' 
       OR jobname LIKE 'robot_exec_%'
       OR jobname LIKE 'uber_sync_%'
  LOOP
    PERFORM cron.unschedule(job_record.jobname);
    RAISE NOTICE 'Removed cron job: %', job_record.jobname;
  END LOOP;
END;
$$;

-- Execute cleanup
SELECT public.cleanup_old_cron_jobs();

-- Drop the cleanup function (one-time use)
DROP FUNCTION public.cleanup_old_cron_jobs();
