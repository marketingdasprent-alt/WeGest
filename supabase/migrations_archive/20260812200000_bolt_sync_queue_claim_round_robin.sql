-- ============================================================
-- bolt_sync_queue_claim: alternar entre integrações (round-robin)
-- ============================================================
-- A fila enfileira todas as semanas de todas as integrações numa só
-- instrução INSERT — logo, todos os `created_at` ficam IGUAIS ao
-- microssegundo. O claim ordenava só por `created_at`, e com o empate a
-- ordem passava a ser a que o Postgres devolvesse.
--
-- Resultado observado a 2026-08-12: das 4 integrações da Década Ousada,
-- duas (Distancia Lisboa e Década Sapo) apanharam 19 lugares seguidos e
-- as outras duas (S Miguel e Urbango) não chegaram a arrancar. Não é
-- fome causada por prioridade — é ausência de critério.
--
-- Passa a servir por RODADAS: a 1ª semana de cada integração, depois a 2ª
-- de cada uma, e assim por diante. Com N integrações, nenhuma espera mais
-- do que N-1 lugares. Dentro da mesma integração mantém-se a ordem
-- cronológica das semanas.
--
-- O resto do comportamento fica igual: lock consultivo para não haver dois
-- drains a reclamar ao mesmo tempo, requeue dos `running` pendurados há
-- mais de 15 min, e o tecto de concorrência vindo do chamador.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bolt_sync_queue_claim(p_max integer)
 RETURNS SETOF public.bolt_sync_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_running integer; v_capacity integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('bolt_sync_queue_claim')) THEN RETURN; END IF;

  UPDATE public.bolt_sync_queue
     SET status='failed', completed_at=now(),
         error_message='Timeout: execução ultrapassou 15 minutos'
   WHERE status='running' AND started_at < now() - interval '15 minutes';

  SELECT count(*) INTO v_running FROM public.bolt_sync_queue WHERE status='running';
  v_capacity := GREATEST(p_max - v_running, 0);
  IF v_capacity = 0 THEN RETURN; END IF;

  -- Em CTEs separadas de propósito: `FOR UPDATE` não pode viver no mesmo
  -- nível de uma função de janela. Ordena-se primeiro, tranca-se depois.
  RETURN QUERY
  WITH ordenadas AS (
    SELECT id,
           -- Posição da semana dentro da própria integração. É isto que
           -- transforma a fila em rodadas: todos os "1º lugar" primeiro.
           row_number() OVER (
             PARTITION BY integracao_id
             ORDER BY created_at ASC, periodo_inicio ASC
           ) AS rodada,
           created_at, periodo_inicio
      FROM public.bolt_sync_queue
     WHERE status='pending'
  ),
  escolhidas AS (
    SELECT id FROM ordenadas
     ORDER BY rodada ASC, created_at ASC, periodo_inicio ASC
     LIMIT v_capacity
  ),
  travadas AS (
    SELECT q.id
      FROM public.bolt_sync_queue q
      JOIN escolhidas e ON e.id = q.id
     WHERE q.status='pending'
     FOR UPDATE OF q SKIP LOCKED
  )
  UPDATE public.bolt_sync_queue q
     SET status='running', started_at=now()
    FROM travadas t
   WHERE q.id = t.id
  RETURNING q.*;
END;
$function$;

COMMENT ON FUNCTION public.bolt_sync_queue_claim(integer) IS
  'Reclama até p_max linhas pendentes, alternando entre integrações (round-robin) '
  'para nenhuma ficar à fome. Ver migração 20260812200000.';
