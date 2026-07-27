-- Motor de Automação — Fase 2, Sub-projeto 1: Event Bus + Rule Engine
-- (config). Ver docs/superpowers/plans/2026-07-27-motor-automacao-fundacao-dados.md.

create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  event_type text not null,
  entity_table text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  emitted_by text not null check (emitted_by in ('trigger', 'edge_function', 'cron', 'manual')),
  correlation_id uuid,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_domain_events_org_type_time on public.domain_events (org_id, event_type, occurred_at desc);
create index idx_domain_events_entity on public.domain_events (entity_table, entity_id);
create index idx_domain_events_unprocessed on public.domain_events (processed_at) where processed_at is null;

alter table public.domain_events enable row level security;

create policy rls_org_isolation on public.domain_events
  as restrictive for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id = public.get_current_org_id());

create policy mt_domain_events_select on public.domain_events
  for select to authenticated
  using (public.is_current_user_admin() or public.has_permission(auth.uid(), 'automacoes'));

comment on table public.domain_events is 'Event Bus: registo append-only de factos do domínio. Escrito só por SECURITY DEFINER (triggers/edge functions); nunca por INSERT direto do cliente.';

-- ------------------------------------------------------------

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  codigo text not null,
  nome text not null,
  descricao text,
  event_type text not null,
  condicoes jsonb not null default '{}'::jsonb,
  acao_tipo text not null check (acao_tipo in ('notificacao', 'webhook', 'automacao_interna')),
  acao_config jsonb not null default '{}'::jsonb,
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  cooldown_minutos integer not null default 0,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (codigo, org_id)
);

create index idx_automation_rules_org_ativo on public.automation_rules (org_id) where ativo;
create index idx_automation_rules_event_type on public.automation_rules (event_type) where ativo;

alter table public.automation_rules enable row level security;

create policy rls_org_isolation on public.automation_rules
  as restrictive for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id = public.get_current_org_id());

create policy mt_automation_rules_select on public.automation_rules
  for select to authenticated
  using (public.is_current_user_admin() or public.has_permission(auth.uid(), 'automacoes'));

create policy mt_automation_rules_write on public.automation_rules
  for all to authenticated
  using (public.is_current_user_admin() or public.can_edit(auth.uid(), 'automacoes'))
  with check (public.is_current_user_admin() or public.can_edit(auth.uid(), 'automacoes'));

create trigger update_automation_rules_updated_at
  before update on public.automation_rules
  for each row execute function public.update_updated_at_column();

comment on table public.automation_rules is 'Rule Engine: definição declarativa de automações — condição + ação, sem exigir deploy de código para cada regra nova.';

-- ------------------------------------------------------------

insert into public.recursos (nome, descricao, categoria)
values ('automacoes', 'Motor de automação e notificações', 'sistema')
on conflict (nome) do nothing;
