-- Motor de Automação — Fase 2, Sub-projeto 4: Notification Center
-- (schema base). notifications é a evolução de notificacoes (mantida
-- intacta e a funcionar para os seus consumidores atuais); corrige o
-- CHECK-list frágil de tipo e a coluna de destinatário duplicada/sem
-- índice já encontradas em notificacoes.
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-notification-center.md.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  destinatario_user_id uuid not null references auth.users(id) on delete cascade,
  template_codigo text not null,
  severidade text not null default 'normal' check (severidade in ('baixa', 'normal', 'alta', 'urgente')),
  titulo text not null,
  mensagem text,
  link text,
  entity_table text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  lida boolean not null default false,
  lida_em timestamptz,
  resolvida boolean not null default false,
  resolvida_por uuid references auth.users(id),
  resolvida_em timestamptz,
  rule_run_id uuid references public.automation_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_notifications_destinatario_nao_lidas on public.notifications (destinatario_user_id) where not lida;
create index idx_notifications_org_created on public.notifications (org_id, created_at desc);
create index idx_notifications_entity on public.notifications (entity_table, entity_id);

alter table public.notifications enable row level security;
alter table public.notifications replica identity full;

create policy rls_org_isolation on public.notifications
  as restrictive for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id = public.get_current_org_id());

create policy mt_notifications_select on public.notifications
  for select to authenticated
  using (destinatario_user_id = auth.uid() or public.is_current_user_admin());

create policy mt_notifications_update on public.notifications
  for update to authenticated
  using (destinatario_user_id = auth.uid() or public.is_current_user_admin())
  with check (destinatario_user_id = auth.uid() or public.is_current_user_admin());

comment on table public.notifications is 'Evolução de notificacoes: coluna única de destinatário e template_codigo (referência lógica a notification_templates) em vez de um CHECK-list de tipo. notificacoes continua a existir e a funcionar — sem cutover ainda.';

alter publication supabase_realtime add table public.notifications;

-- ------------------------------------------------------------

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  codigo text not null,
  canal text not null check (canal in ('interno', 'email', 'whatsapp', 'sms', 'push')),
  idioma text not null default 'pt-PT',
  assunto text,
  corpo_template text not null,
  corpo_formato text not null default 'text' check (corpo_formato in ('text', 'html', 'markdown')),
  variaveis_esperadas text[],
  versao integer not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (codigo, canal, idioma, versao, org_id)
);

create index idx_notification_templates_lookup on public.notification_templates (org_id, codigo, canal, idioma) where ativo;

alter table public.notification_templates enable row level security;

create policy rls_org_isolation on public.notification_templates
  as restrictive for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id = public.get_current_org_id());

create policy mt_notification_templates_select on public.notification_templates
  for select to authenticated
  using (public.is_current_user_admin() or public.has_permission(auth.uid(), 'automacoes'));

create policy mt_notification_templates_write on public.notification_templates
  for all to authenticated
  using (public.is_current_user_admin() or public.can_edit(auth.uid(), 'automacoes'))
  with check (public.is_current_user_admin() or public.can_edit(auth.uid(), 'automacoes'));

create trigger update_notification_templates_updated_at
  before update on public.notification_templates
  for each row execute function public.update_updated_at_column();

comment on table public.notification_templates is 'Copy/formato por tipo x canal x idioma. org_id NOT NULL: sem template de plataforma partilhado ainda — cada org precisa da sua própria linha (Fase 2 do roadmap resolve isto).';
