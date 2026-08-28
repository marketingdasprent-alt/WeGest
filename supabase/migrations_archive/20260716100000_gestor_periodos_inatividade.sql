-- supabase/migrations/20260716100000_gestor_periodos_inatividade.sql
-- Período de inatividade do gestor: agendamento de ausência que bloqueia
-- disponibilidade como transferista (profiles.disponivel_transferista) e
-- avisa por email os motoristas geridos por ele
-- (motoristas_ativos.gestor_responsavel = profiles.nome).

create extension if not exists btree_gist;

create table if not exists public.gestor_periodos_inatividade (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.get_current_org_id() references public.organizacoes(id) on delete cascade,
  gestor_id uuid not null references public.profiles(id) on delete cascade,
  data_inicio date not null,
  data_fim date not null,
  status text not null default 'agendado'
    check (status in ('agendado', 'ativo', 'concluido', 'cancelado')),
  notificado_inicio_em timestamptz,
  notificado_fim_em timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint gestor_periodos_data_fim_check check (data_fim >= data_inicio)
);

-- Sem sobreposição de períodos agendados/ativos do mesmo gestor.
alter table public.gestor_periodos_inatividade
  drop constraint if exists gestor_periodos_no_overlap;
alter table public.gestor_periodos_inatividade
  add constraint gestor_periodos_no_overlap
  exclude using gist (
    gestor_id with =,
    daterange(data_inicio, data_fim, '[]') with &&
  ) where (status in ('agendado', 'ativo'));

create index if not exists idx_gestor_periodos_cron
  on public.gestor_periodos_inatividade (status, data_inicio, data_fim);
create index if not exists idx_gestor_periodos_gestor
  on public.gestor_periodos_inatividade (gestor_id);
create index if not exists idx_gestor_periodos_org
  on public.gestor_periodos_inatividade (org_id);

alter table public.gestor_periodos_inatividade enable row level security;

-- Isolamento restritivo por org (mesmo padrão de reserva_coberturas).
drop policy if exists rls_org_isolation on public.gestor_periodos_inatividade;
create policy rls_org_isolation on public.gestor_periodos_inatividade
  as restrictive
  for all
  to authenticated
  using (org_id = get_current_org_id())
  with check (org_id is null or org_id = get_current_org_id());

-- Gestor vê/gere só os seus períodos; admin vê/gere todos da sua org.
drop policy if exists mt_gestor_periodos_select on public.gestor_periodos_inatividade;
create policy mt_gestor_periodos_select on public.gestor_periodos_inatividade
  for select
  to authenticated
  using (org_id = get_current_org_id() and (gestor_id = auth.uid() or is_current_user_admin()));

drop policy if exists mt_gestor_periodos_insert on public.gestor_periodos_inatividade;
create policy mt_gestor_periodos_insert on public.gestor_periodos_inatividade
  for insert
  to authenticated
  with check (
    (org_id is null or org_id = get_current_org_id())
    and (gestor_id = auth.uid() or is_current_user_admin())
  );

drop policy if exists mt_gestor_periodos_update on public.gestor_periodos_inatividade;
create policy mt_gestor_periodos_update on public.gestor_periodos_inatividade
  for update
  to authenticated
  using (org_id = get_current_org_id() and (gestor_id = auth.uid() or is_current_user_admin()));

-- Cancelar é um UPDATE de status (feito pelo gestor); DELETE fica só p/ admin.
drop policy if exists mt_gestor_periodos_delete on public.gestor_periodos_inatividade;
create policy mt_gestor_periodos_delete on public.gestor_periodos_inatividade
  for delete
  to authenticated
  using (org_id = get_current_org_id() and is_current_user_admin());

grant select, insert, update, delete, truncate, references, trigger
  on public.gestor_periodos_inatividade to anon, authenticated, service_role;
