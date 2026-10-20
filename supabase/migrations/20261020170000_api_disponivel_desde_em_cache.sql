-- ============================================================
-- API do site: "disponível desde" calculado por cron, não por pedido
-- ============================================================
-- api_modelos_disponivel_desde simula 15 dias de livres e procura para todos
-- os modelos (~25 000 blocos por chamada) e corria em cada GET /modelos e
-- GET /modelos/:id. O site varre o catálogo a cada ~8 min e a 20-10-2026 levou
-- a BD a 100 % de IO. Agora um cron guarda o resultado por organização de 10 em
-- 10 min e a função lê a cache; sem cache fresca, calcula como antes.
-- Disponibilidade, cotação e reserva continuam a calcular na hora.
-- ============================================================

-- Cache derivada (reconstruída de 10 em 10 min): sem deleted_at.
create table if not exists public.api_disponivel_desde_cache (
  org_id uuid primary key references public.organizacoes(id) on delete cascade,
  modelos jsonb not null default '[]'::jsonb,
  calculado_em timestamptz not null default now()
);
alter table public.api_disponivel_desde_cache enable row level security;
revoke all on table public.api_disponivel_desde_cache from public, anon, authenticated;
-- As duas redes de sempre (rls_org_isolation e rls_deny_anon), mesmo sem grants.
drop policy if exists rls_deny_anon on public.api_disponivel_desde_cache;
create policy rls_deny_anon on public.api_disponivel_desde_cache as restrictive to anon
  using (false) with check (false);
drop policy if exists rls_org_isolation on public.api_disponivel_desde_cache;
create policy rls_org_isolation on public.api_disponivel_desde_cache as restrictive to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id = public.get_current_org_id());

-- O cálculo de sempre (corpo de 20261014190000), agora só chamado pelo cron
-- e como recurso quando a cache falta.
create or replace function public.api_modelos_disponivel_desde_calcular(p_org_id uuid)
returns table (modelo_id uuid, disponivel_desde date)
language sql stable security definer set search_path = '' as $$
  with janelas as (
    select k, now() + make_interval(days => k) as i, now() + make_interval(days => k + 1) as f
      from generate_series(0, 14) k
  ), livres as (
    select j.k, j.i, l.modelo_id, count(*)::int as q
      from janelas j
      cross join lateral public.api_viaturas_livres(p_org_id, j.i, j.f) l
     group by j.k, j.i, l.modelo_id
  ), procura as (
    select j.k, s.modelo_id, s.n
      from janelas j
      cross join lateral public.api_procura_sem_viatura(p_org_id, j.i, j.f) s
  )
  select l.modelo_id, min((l.i at time zone 'Europe/Lisbon')::date)
    from livres l
    left join procura p on p.k = l.k and p.modelo_id = l.modelo_id
   where l.q - coalesce(p.n, 0) > 0
   group by l.modelo_id;
$$;

-- Mesma assinatura que api_modelos e api_modelo já usam. 20 min de validade
-- toleram uma volta do cron falhada; a data nunca fica antes de hoje.
create or replace function public.api_modelos_disponivel_desde(p_org_id uuid)
returns table (modelo_id uuid, disponivel_desde date)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_modelos jsonb;
  v_hoje date := (now() at time zone 'Europe/Lisbon')::date;
begin
  select c.modelos into v_modelos
    from public.api_disponivel_desde_cache c
   where c.org_id = p_org_id and c.calculado_em > now() - interval '20 minutes';
  if v_modelos is not null then
    return query
      select (e->>'modelo_id')::uuid, greatest((e->>'disponivel_desde')::date, v_hoje)
        from jsonb_array_elements(v_modelos) e;
  else
    return query select * from public.api_modelos_disponivel_desde_calcular(p_org_id);
  end if;
end $$;

-- Só organizações com chave de API activa. Uma organização que falhe não
-- impede as outras; fica o aviso no log do Postgres.
create or replace function public.api_refrescar_disponivel_desde()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  for v_org in
    select distinct k.org_id from public.api_chaves k
     where k.ativo and (k.expires_at is null or k.expires_at > now())
  loop
    begin
      insert into public.api_disponivel_desde_cache (org_id, modelos, calculado_em)
      select v_org,
             coalesce(jsonb_agg(jsonb_build_object('modelo_id', d.modelo_id,
                                                   'disponivel_desde', d.disponivel_desde)), '[]'::jsonb),
             now()
        from public.api_modelos_disponivel_desde_calcular(v_org) d
      on conflict (org_id) do update
        set modelos = excluded.modelos, calculado_em = excluded.calculado_em;
    exception when others then
      raise warning 'api_refrescar_disponivel_desde: org % falhou: %', v_org, sqlerrm;
    end;
  end loop;
end $$;

-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated em cada função nova. Nomeiam-se os três.
do $$
declare f text;
begin
  foreach f in array array[
    'api_modelos_disponivel_desde_calcular(uuid)',
    'api_modelos_disponivel_desde(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke execute on function public.api_refrescar_disponivel_desde() from public, anon, authenticated, service_role;

select cron.schedule('api_disponivel_desde_cache', '*/10 * * * *',
  $$ select public.api_refrescar_disponivel_desde() $$)
where not exists (select 1 from cron.job where jobname = 'api_disponivel_desde_cache');

-- Enche já a cache para não esperar pela primeira volta do cron.
select public.api_refrescar_disponivel_desde();

notify pgrst, 'reload schema';
