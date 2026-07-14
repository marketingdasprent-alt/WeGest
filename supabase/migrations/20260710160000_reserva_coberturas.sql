-- reserva_coberturas: espelha contrato_coberturas, à escala da reserva.
-- Permite fixar as coberturas escolhidas ainda na fase de reserva (antes de
-- existir contrato), tal como já acontece com reserva_extras/reserva_taxas.

create table if not exists public.reserva_coberturas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  reserva_id uuid not null references public.reservas(id) on delete cascade,
  cobertura_id uuid not null references public.renting_coberturas(id) on delete restrict,
  cobertura_nome text not null,
  preco_dia numeric not null,
  franquia_valor numeric,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint reserva_coberturas_reserva_cobertura_unique unique (reserva_id, cobertura_id)
);

create index if not exists idx_reserva_coberturas_reserva on public.reserva_coberturas using btree (reserva_id);
create index if not exists idx_reserva_coberturas_cobertura on public.reserva_coberturas using btree (cobertura_id);
create index if not exists idx_reserva_coberturas_org on public.reserva_coberturas using btree (org_id);

alter table public.reserva_coberturas enable row level security;

create or replace function public.set_reserva_cobertura_org_id()
returns trigger
language plpgsql
as $function$
begin
  if new.org_id is null then
    select org_id into new.org_id from public.reservas where id = new.reserva_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_reserva_coberturas_set_org_id on public.reserva_coberturas;
create trigger trg_reserva_coberturas_set_org_id
  before insert on public.reserva_coberturas
  for each row execute function public.set_reserva_cobertura_org_id();

-- Mesmo padrão de RLS das restantes tabelas reserva_* (isolamento restritivo
-- por org_id + gate permissivo por permissão de acesso a reservas de renting).
drop policy if exists rls_org_isolation on public.reserva_coberturas;
create policy rls_org_isolation on public.reserva_coberturas
  as restrictive
  for all
  to authenticated
  using (org_id = get_current_org_id())
  with check (org_id is null or org_id = get_current_org_id());

drop policy if exists mt_reserva_coberturas_select on public.reserva_coberturas;
create policy mt_reserva_coberturas_select on public.reserva_coberturas
  for select
  to authenticated
  using (org_id = get_current_org_id() and has_renting_reservas_access());

drop policy if exists mt_reserva_coberturas_insert on public.reserva_coberturas;
create policy mt_reserva_coberturas_insert on public.reserva_coberturas
  for insert
  to authenticated
  with check ((org_id is null or org_id = get_current_org_id()) and has_renting_reservas_access());

drop policy if exists mt_reserva_coberturas_update on public.reserva_coberturas;
create policy mt_reserva_coberturas_update on public.reserva_coberturas
  for update
  to authenticated
  using (org_id = get_current_org_id() and has_renting_reservas_access());

drop policy if exists mt_reserva_coberturas_delete on public.reserva_coberturas;
create policy mt_reserva_coberturas_delete on public.reserva_coberturas
  for delete
  to authenticated
  using (org_id = get_current_org_id() and has_renting_reservas_access());

grant select, insert, update, delete, truncate, references, trigger
  on public.reserva_coberturas to anon, authenticated, service_role;
