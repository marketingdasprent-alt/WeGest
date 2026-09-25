BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- Estado efémero de segurança, incluindo operações sem organização; não é dado de negócio.
CREATE TABLE private.edge_rate_limits (
  operation text NOT NULL,
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  shard smallint NOT NULL CHECK (shard BETWEEN 0 AND 63),
  request_times timestamptz[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  PRIMARY KEY (operation, subject_hash)
);
CREATE INDEX edge_rate_limits_expiry ON private.edge_rate_limits (shard, expires_at);
CREATE INDEX edge_rate_limits_capacity ON private.edge_rate_limits (shard, operation);
CREATE INDEX edge_rate_limits_active ON private.edge_rate_limits (expires_at) WHERE deleted_at IS NULL;
ALTER TABLE private.edge_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.edge_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.consume_edge_rate_limit(
  p_operation text, p_subject_hash text, p_limit integer, p_window_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '5s'
AS $$
DECLARE
  v_now timestamptz;
  v_times timestamptz[];
  v_shard smallint;
  v_exists boolean;
BEGIN
  IF p_operation IS NULL OR p_operation !~ '^[a-z0-9-]{1,64}$'
     OR p_subject_hash IS NULL OR p_subject_hash !~ '^[a-f0-9]{64}$'
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000
     OR p_window_seconds IS NULL OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters' USING ERRCODE = '22023';
  END IF;

  -- O lock de shard serializa reserva e capacidade: 64 x 1024 identidades por
  -- operação. A capacidade é por operação para quem encher um endpoint público
  -- não deixar os outros (ex.: API Primavera) sem lugar.
  v_shard := get_byte(decode(substr(p_subject_hash, 1, 2), 'hex'), 0) % 64;
  PERFORM pg_advisory_xact_lock(20260925, v_shard::integer);
  v_now := clock_timestamp();
  DELETE FROM private.edge_rate_limits WHERE shard = v_shard AND expires_at <= v_now;

  SELECT request_times INTO v_times FROM private.edge_rate_limits
    WHERE operation = p_operation AND subject_hash = p_subject_hash;
  v_exists := FOUND;
  IF NOT v_exists AND (
    SELECT count(*) FROM private.edge_rate_limits WHERE shard = v_shard AND operation = p_operation
  ) >= 1024 THEN
    RETURN jsonb_build_object('allowed', false, 'retry_after', 30, 'unavailable', true);
  END IF;

  SELECT coalesce(array_agg(t ORDER BY t), '{}'::timestamptz[]) INTO v_times
    FROM unnest(v_times) t WHERE t > v_now - make_interval(secs => p_window_seconds);
  IF cardinality(v_times) >= p_limit THEN
    RETURN jsonb_build_object('allowed', false, 'retry_after', greatest(1,
      ceil(extract(epoch FROM v_times[cardinality(v_times) - p_limit + 1]
        + make_interval(secs => p_window_seconds) - v_now))::integer));
  END IF;

  INSERT INTO private.edge_rate_limits(operation, subject_hash, shard, request_times, expires_at)
    VALUES (p_operation, p_subject_hash, v_shard, array_append(v_times, v_now),
      v_now + make_interval(secs => p_window_seconds))
    ON CONFLICT (operation, subject_hash) DO UPDATE
      SET request_times = EXCLUDED.request_times, expires_at = EXCLUDED.expires_at;
  RETURN jsonb_build_object('allowed', true, 'retry_after', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(text, text, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
