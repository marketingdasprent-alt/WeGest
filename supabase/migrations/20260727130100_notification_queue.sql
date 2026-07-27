-- Motor de Automação — Fase 2, Sub-projeto 4 (parte 2): fila de entrega
-- multi-canal + log de entrega. Mesmo idioma de claim/retry/dead-letter
-- de automation_runs_claim() (Sub-projeto 1), reutilizando failed_jobs.
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-notification-center.md.

create table public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp', 'sms', 'push')),
  destinatario text not null,
  template_codigo text not null,
  payload_render jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'sent', 'failed')),
  priority smallint not null default 5,
  attempt smallint not null default 0,
  max_attempts smallint not null default 5,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_notification_queue_claimable on public.notification_queue (canal, next_attempt_at) where status = 'pending';
create index idx_notification_queue_notification on public.notification_queue (notification_id);

alter table public.notification_queue enable row level security;

create policy rls_org_isolation on public.notification_queue
  as restrictive for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id = public.get_current_org_id());

create policy mt_notification_queue_select on public.notification_queue
  for select to authenticated
  using (public.is_current_user_admin() or public.has_permission(auth.uid(), 'automacoes'));

comment on table public.notification_queue is 'Worklist de envio multi-canal — uma linha por (notificação x canal externo). O canal interno não passa aqui (já é imediato via notifications + Realtime). Escrita só via notification_queue_claim()/_complete()/_fail().';

-- ------------------------------------------------------------

create table public.notification_delivery (
  id uuid primary key default gen_random_uuid(),
  notification_queue_id uuid references public.notification_queue(id) on delete set null,
  notification_id uuid references public.notifications(id) on delete set null,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  canal text not null,
  destinatario text not null,
  provider text,
  provider_message_id text,
  status text not null default 'enviado' check (status in ('enviado', 'entregue', 'aberto', 'clicado', 'falhado')),
  enviado_em timestamptz default now(),
  entregue_em timestamptz,
  aberto_em timestamptz,
  clicado_em timestamptz,
  falhou_em timestamptz,
  erro text,
  created_at timestamptz not null default now()
);

create index idx_notification_delivery_notification on public.notification_delivery (notification_id);
create index idx_notification_delivery_org_canal_time on public.notification_delivery (org_id, canal, enviado_em desc);
create index idx_notification_delivery_provider_msg on public.notification_delivery (provider_message_id) where provider_message_id is not null;

alter table public.notification_delivery enable row level security;

create policy rls_org_isolation on public.notification_delivery
  as restrictive for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id = public.get_current_org_id());

create policy mt_notification_delivery_select on public.notification_delivery
  for select to authenticated
  using (public.is_current_user_admin() or public.has_permission(auth.uid(), 'automacoes'));

comment on table public.notification_delivery is 'Log imutável de entrega/engagement por envio externo — generaliza email_sends (já generalizado de marketing-only em julho de 2026) para ser agnóstico de canal.';

-- ------------------------------------------------------------

create or replace function public.notification_queue_claim(p_canal text, p_max integer default 10)
returns setof public.notification_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_queue
  set status = 'failed',
      error_message = coalesce(error_message || ' | ', '') || 'timeout: running há mais de 15 minutos'
  where status = 'running'
    and canal = p_canal
    and started_at < now() - interval '15 minutes';

  return query
  update public.notification_queue q
  set status = 'running',
      started_at = now(),
      attempt = q.attempt + 1
  from (
    select id
    from public.notification_queue
    where status = 'pending'
      and canal = p_canal
      and next_attempt_at <= now()
    order by priority asc, created_at asc
    limit p_max
    for update skip locked
  ) claimed
  where q.id = claimed.id
  returning q.*;
end;
$$;

create or replace function public.notification_queue_complete(p_id uuid)
returns public.notification_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notification_queue;
begin
  update public.notification_queue
  set status = 'sent'
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.notification_queue_fail(p_id uuid, p_error text)
returns public.notification_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notification_queue;
begin
  select * into v_row from public.notification_queue where id = p_id for update;

  if v_row.attempt >= v_row.max_attempts then
    update public.notification_queue
    set status = 'failed', error_message = p_error
    where id = p_id
    returning * into v_row;

    insert into public.failed_jobs (source_table, source_id, org_id, job_type, payload, attempts, last_error)
    values ('notification_queue', v_row.id, v_row.org_id, v_row.canal, v_row.payload_render, v_row.attempt, p_error);
  else
    update public.notification_queue
    set status = 'pending',
        error_message = p_error,
        next_attempt_at = now() + (power(2, v_row.attempt) * interval '1 minute')
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.notification_queue_claim(text, integer) from public, anon, authenticated;
revoke all on function public.notification_queue_complete(uuid) from public, anon, authenticated;
revoke all on function public.notification_queue_fail(uuid, text) from public, anon, authenticated;
grant execute on function public.notification_queue_claim(text, integer) to service_role;
grant execute on function public.notification_queue_complete(uuid) to service_role;
grant execute on function public.notification_queue_fail(uuid, text) to service_role;
