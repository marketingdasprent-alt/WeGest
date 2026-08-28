-- Motor de Automação — Fase 2, Sub-projeto 1: fila genérica com retry e
-- dead-letter. Idioma da fila (claim atómico + índice único parcial +
-- sweep de stale) reaproveitado de via_verde_sync_queue_claim()
-- (supabase/migrations/20260723100000_via_verde_sync_queue.sql).
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-fundacao-dados.md.

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  trigger_event_id uuid references public.domain_events(id) on delete set null,
  job_type text not null default 'automation_rule',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  priority smallint not null default 5,
  attempt smallint not null default 0,
  max_attempts smallint not null default 3,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

-- Um único run "ativo" (pending ou running) por regra+org — dedup por
-- construção, tal como via_verde_sync_queue faz por integração.
create unique index idx_automation_runs_one_active_per_rule
  on public.automation_runs (rule_id, org_id)
  where status in ('pending', 'running');

create index idx_automation_runs_claimable
  on public.automation_runs (next_attempt_at)
  where status = 'pending';

create index idx_automation_runs_rule_created
  on public.automation_runs (rule_id, created_at desc);

alter table public.automation_runs enable row level security;

create policy rls_org_isolation on public.automation_runs
  as restrictive for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id = public.get_current_org_id());

create policy mt_automation_runs_select on public.automation_runs
  for select to authenticated
  using (public.is_current_user_admin() or public.has_permission(auth.uid(), 'automacoes'));

comment on table public.automation_runs is 'Fila de execução do Automation Executor. Escrita só via automation_runs_claim()/_complete()/_fail() (SECURITY DEFINER) — sem INSERT/UPDATE direto do cliente.';

-- ------------------------------------------------------------

create table public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.automation_runs(id) on delete set null,
  rule_id uuid references public.automation_rules(id) on delete set null,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  evento text not null check (evento in ('executada', 'falhou', 'ignorada_cooldown', 'condicao_nao_satisfeita')),
  detalhe jsonb not null default '{}'::jsonb,
  notification_ids uuid[] not null default '{}',
  duracao_ms integer,
  created_at timestamptz not null default now()
);

create index idx_automation_logs_rule_created on public.automation_logs (rule_id, created_at desc);
create index idx_automation_logs_org_created on public.automation_logs (org_id, created_at desc);

alter table public.automation_logs enable row level security;

create policy rls_org_isolation on public.automation_logs
  as restrictive for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id = public.get_current_org_id());

create policy mt_automation_logs_select on public.automation_logs
  for select to authenticated
  using (public.is_current_user_admin() or public.has_permission(auth.uid(), 'automacoes'));

comment on table public.automation_logs is 'Histórico imutável do que uma automação fez — sobrevive à poda de automation_runs (run_id/rule_id têm ON DELETE SET NULL).';

-- ------------------------------------------------------------

create table public.failed_jobs (
  id uuid primary key default gen_random_uuid(),
  source_table text not null default 'automation_runs',
  source_id uuid not null,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  job_type text not null,
  payload jsonb,
  attempts smallint not null,
  last_error text,
  failed_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

create index idx_failed_jobs_unresolved on public.failed_jobs (failed_at desc) where not resolved;
create index idx_failed_jobs_org on public.failed_jobs (org_id);

alter table public.failed_jobs enable row level security;

create policy rls_org_isolation on public.failed_jobs
  as restrictive for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id = public.get_current_org_id());

create policy mt_failed_jobs_select on public.failed_jobs
  for select to authenticated
  using (public.is_current_user_admin() or public.has_permission(auth.uid(), 'automacoes'));

create policy mt_failed_jobs_resolve on public.failed_jobs
  for update to authenticated
  using (public.is_current_user_admin() or public.can_edit(auth.uid(), 'automacoes'))
  with check (public.is_current_user_admin() or public.can_edit(auth.uid(), 'automacoes'));

comment on table public.failed_jobs is 'Dead-letter: jobs que esgotaram as tentativas. Único sítio que a equipa precisa de vigiar (separador "Falhas" do futuro dashboard admin).';

-- ------------------------------------------------------------
-- Funções da fila — só o service_role as executa (o Automation Executor).
-- Nenhum cliente autenticado normal deve chamar estas RPCs diretamente.

create or replace function public.automation_runs_claim(p_max integer default 10)
returns setof public.automation_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sweep: falha runs presos em "running" há mais de 15 minutos.
  update public.automation_runs
  set status = 'failed',
      error_message = coalesce(error_message || ' | ', '') || 'timeout: running há mais de 15 minutos',
      completed_at = now()
  where status = 'running'
    and started_at < now() - interval '15 minutes';

  return query
  update public.automation_runs r
  set status = 'running',
      started_at = now(),
      attempt = r.attempt + 1
  from (
    select id
    from public.automation_runs
    where status = 'pending'
      and next_attempt_at <= now()
    order by priority asc, created_at asc
    limit p_max
    for update skip locked
  ) claimed
  where r.id = claimed.id
  returning r.*;
end;
$$;

create or replace function public.automation_runs_complete(p_run_id uuid)
returns public.automation_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.automation_runs;
begin
  update public.automation_runs
  set status = 'completed', completed_at = now()
  where id = p_run_id
  returning * into v_run;

  insert into public.automation_logs (run_id, rule_id, org_id, evento)
  values (v_run.id, v_run.rule_id, v_run.org_id, 'executada');

  return v_run;
end;
$$;

create or replace function public.automation_runs_fail(p_run_id uuid, p_error text)
returns public.automation_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.automation_runs;
begin
  select * into v_run from public.automation_runs where id = p_run_id for update;

  if v_run.attempt >= v_run.max_attempts then
    update public.automation_runs
    set status = 'failed', error_message = p_error, completed_at = now()
    where id = p_run_id
    returning * into v_run;

    insert into public.failed_jobs (source_table, source_id, org_id, job_type, payload, attempts, last_error)
    values ('automation_runs', v_run.id, v_run.org_id, v_run.job_type, v_run.payload, v_run.attempt, p_error);
  else
    update public.automation_runs
    set status = 'pending',
        error_message = p_error,
        next_attempt_at = now() + (power(2, v_run.attempt) * interval '1 minute')
    where id = p_run_id
    returning * into v_run;
  end if;

  insert into public.automation_logs (run_id, rule_id, org_id, evento, detalhe)
  values (v_run.id, v_run.rule_id, v_run.org_id, 'falhou', jsonb_build_object('erro', p_error, 'attempt', v_run.attempt));

  return v_run;
end;
$$;

revoke all on function public.automation_runs_claim(integer) from public, anon, authenticated;
revoke all on function public.automation_runs_complete(uuid) from public, anon, authenticated;
revoke all on function public.automation_runs_fail(uuid, text) from public, anon, authenticated;
grant execute on function public.automation_runs_claim(integer) to service_role;
grant execute on function public.automation_runs_complete(uuid) to service_role;
grant execute on function public.automation_runs_fail(uuid, text) to service_role;
