
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
BEGIN
  -- Validate job name prefix for security
  IF p_job_name !~ '^(bolt_sync_|robot_exec_|uber_sync_)[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Nome de job inválido: %', p_job_name;
  END IF;

  IF p_action = 'delete' THEN
    PERFORM cron.unschedule(p_job_name);
    RETURN jsonb_build_object('success', true, 'action', 'deleted', 'job_name', p_job_name);
  ELSIF p_action = 'schedule' THEN
    IF p_cron_expression IS NULL OR p_function_url IS NULL OR p_anon_key IS NULL THEN
      RAISE EXCEPTION 'cron_expression, function_url e anon_key são obrigatórios para agendar';
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
    RAISE EXCEPTION 'Ação inválida: %. Use "schedule" ou "delete"', p_action;
  END IF;
END;
$$;
