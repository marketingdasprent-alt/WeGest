-- ============================================================
-- Vigia das filas de sincronização: falha e encravanço passam a avisar
-- ============================================================
-- O vigia da migração anterior (20260824090000) só vê o estado HTTP da
-- invocação cron→edge. Isso apanha a 401 que escondeu dez dias de Bolt, mas
-- não apanha o andar de baixo:
--
--   bolt-sync-drain/index.ts:158
--     return json({ success: true, processadas, concluidas: ok, falhadas: ... })
--
-- O drain responde 200 com success:true mesmo que TODAS as linhas tenham
-- falhado. Se a segunda-feira enfileirar bem e a API da Bolt rebentar, a fila
-- enche-se de `failed`, o HTTP continua 200 e o silêncio é o mesmo.
--
-- Nota: `failed` na fila não é só erro de rede. O bolt-sync-drain marca como
-- falhada uma semana que veio VAZIA da API, de propósito — foi assim que o
-- robô antigo escondeu cinco semanas partidas. Esse caso é dos que mais
-- interessa ver.
--
-- Cobre também o encravanço, que nenhum estado de erro denuncia: linha em
-- `pending` que ninguém drena (drain parado), ou em `running` desde sempre
-- (o worker morreu a meio e a linha nunca mais foi fechada).
--
-- Idempotente e aditiva.
--
-- COMO APLICAR: colar no SQL Editor — este projeto não tem o CLI da Supabase.

-- ── 1. Marca de "já avisado" nas duas filas ───────────────────────────────
alter table public.bolt_sync_queue
  add column if not exists alertado_em timestamptz;

alter table public.via_verde_sync_queue
  add column if not exists alertado_em timestamptz;

-- ── 2. O vigia ────────────────────────────────────────────────────────────
create or replace function public.vigiar_filas_sync()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_linha   record;
  v_alertas integer := 0;
begin
  for v_linha in
    -- As duas filas têm formas diferentes; normalizam-se aqui para o resto da
    -- função não ter de saber de qual vieram.
    select 'bolt'::text as fila, q.id, q.org_id, q.status, q.created_at,
           q.started_at, q.periodo_inicio, q.periodo_fim, q.error_message
    from public.bolt_sync_queue q
    where q.alertado_em is null
      and (
        q.status = 'failed'
        or (q.status = 'pending' and q.created_at < now() - interval '2 hours')
        or (q.status = 'running' and q.started_at < now() - interval '1 hour')
      )
    union all
    select 'via_verde', q.id, q.org_id, q.status, q.created_at,
           q.started_at, q.periodo_inicio, q.periodo_fim, q.error_message
    from public.via_verde_sync_queue q
    where q.alertado_em is null
      and (
        q.status = 'failed'
        or (q.status = 'pending' and q.created_at < now() - interval '2 hours')
        or (q.status = 'running' and q.started_at < now() - interval '1 hour')
      )
    order by created_at
  loop
    -- Arrefecimento de 6 h por fila. Uma avaria da API falha as quatro contas
    -- de uma vez; o primeiro aviso chega, os restantes ficam nas filas para
    -- quem for ver. Sem isto, uma noite má rendia dezenas de emails.
    if not exists (
      select 1 from public.failed_jobs f
      where f.job_type = 'sync_fila:' || v_linha.fila
        and f.resolved = false
        and f.failed_at > now() - interval '6 hours'
    ) then
      insert into public.failed_jobs (source_table, source_id, org_id, job_type, payload, attempts, last_error)
      values (
        v_linha.fila || '_sync_queue',
        v_linha.id,
        v_linha.org_id,
        'sync_fila:' || v_linha.fila,
        jsonb_build_object(
          'fila',           v_linha.fila,
          'queue_id',       v_linha.id,
          'status',         v_linha.status,
          'periodo_inicio', v_linha.periodo_inicio,
          'periodo_fim',    v_linha.periodo_fim,
          'created_at',     v_linha.created_at
        ),
        1,
        case v_linha.status
          when 'failed' then
            format('Sincronização %s falhou (%s a %s): %s',
                   v_linha.fila,
                   coalesce(v_linha.periodo_inicio::text, '?'),
                   coalesce(v_linha.periodo_fim::text, '?'),
                   coalesce(nullif(v_linha.error_message, ''), 'sem detalhe'))
          when 'running' then
            format('Sincronização %s encravada em execução desde %s (%s a %s).',
                   v_linha.fila, v_linha.started_at,
                   coalesce(v_linha.periodo_inicio::text, '?'),
                   coalesce(v_linha.periodo_fim::text, '?'))
          else
            format('Sincronização %s na fila sem ser processada desde %s (%s a %s) — o drain está a correr?',
                   v_linha.fila, v_linha.created_at,
                   coalesce(v_linha.periodo_inicio::text, '?'),
                   coalesce(v_linha.periodo_fim::text, '?'))
        end
      );
      v_alertas := v_alertas + 1;
    end if;

    if v_linha.fila = 'bolt' then
      update public.bolt_sync_queue set alertado_em = now() where id = v_linha.id;
    else
      update public.via_verde_sync_queue set alertado_em = now() where id = v_linha.id;
    end if;
  end loop;

  return v_alertas;
end;
$fn$;

comment on function public.vigiar_filas_sync() is
  'Regista em failed_jobs cada linha das filas de sync que falhou ou encravou. Fecha o buraco do bolt-sync-drain, que responde 200 mesmo quando todas as linhas falham.';

revoke all on function public.vigiar_filas_sync() from public, anon, authenticated;

-- ── 3. Agendar ────────────────────────────────────────────────────────────
select cron.unschedule('vigia-filas-sync')
where exists (select 1 from cron.job where jobname = 'vigia-filas-sync');

select cron.schedule(
  'vigia-filas-sync',
  '*/15 * * * *',
  $cron$select public.vigiar_filas_sync()$cron$
);

-- ── 4. Não alertar sobre o passado ────────────────────────────────────────
-- O histórico das filas já foi analisado à mão a 24/08. Sem isto, a primeira
-- passagem despejava meses de linhas antigas em cima dos admins.
--
-- Excluem-se as linhas ainda em pending/running: essas não são histórico, são
-- trabalho a decorrer. Se encravarem a partir de agora, têm de poder avisar.
update public.bolt_sync_queue
set alertado_em = now()
where alertado_em is null and status not in ('pending', 'running');

update public.via_verde_sync_queue
set alertado_em = now()
where alertado_em is null and status not in ('pending', 'running');
