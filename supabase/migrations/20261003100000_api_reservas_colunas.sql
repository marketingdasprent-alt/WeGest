-- ============================================================
-- API rent-a-car, fase C: colunas das reservas vindas do site
-- ============================================================
-- Uma reserva do site chega sem viatura (o cliente escolhe um modelo). A
-- disponibilidade do balcão só vê viatura_id; as funções api_* passam a
-- descontar estas reservas por modelo, para o site nunca vender duas vezes
-- o último carro. O balcão não muda.
-- ============================================================

alter table public.org_definicoes
  add column if not exists emissor_rent_a_car_id uuid references public.clientes(id) on delete set null;

alter table public.reservas
  add column if not exists origem text not null default 'app',
  add column if not exists modelo_id uuid references public.viatura_modelos(id) on delete set null,
  add column if not exists api_chave_id uuid references public.api_chaves(id) on delete set null,
  add column if not exists referencia_externa text,
  add column if not exists dados_site jsonb;

alter table public.reservas drop constraint if exists reservas_origem_valida;
alter table public.reservas add constraint reservas_origem_valida check (origem in ('app', 'site'));
alter table public.reservas drop constraint if exists reservas_referencia_externa_tamanho;
alter table public.reservas add constraint reservas_referencia_externa_tamanho
  check (referencia_externa is null or length(referencia_externa) between 1 and 100);

-- Idempotência do POST /reservas: a mesma chave nunca cria duas reservas com a mesma referência.
create unique index if not exists reservas_referencia_externa_por_chave
  on public.reservas (api_chave_id, referencia_externa)
  where referencia_externa is not null;

create index if not exists idx_reservas_modelo_sem_viatura
  on public.reservas (org_id, modelo_id)
  where viatura_id is null and modelo_id is not null and deleted_at is null;

-- Reservas sem viatura, por modelo, que ocupam o período: pendente, confirmada ou em curso.
create or replace function public.api_procura_sem_viatura(
  p_org_id uuid, p_inicio timestamptz, p_fim timestamptz)
returns table (modelo_id uuid, n int)
language sql stable security definer set search_path = public as $$
  select r.modelo_id, count(*)::int
    from public.reservas r
   where r.org_id = p_org_id
     and r.viatura_id is null
     and r.modelo_id is not null
     and r.deleted_at is null
     and r.estado in ('pendente', 'confirmada', 'em_curso')
     and r.periodo && tstzrange(p_inicio, p_fim, '[)')
   group by r.modelo_id;
$$;

create or replace function public.api_quantidade_disponivel(
  p_org_id uuid, p_modelo_id uuid, p_inicio timestamptz, p_fim timestamptz)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0,
    (select count(*) from public.api_viaturas_livres(p_org_id, p_inicio, p_fim) l
      where l.modelo_id = p_modelo_id)
    - coalesce((select s.n from public.api_procura_sem_viatura(p_org_id, p_inicio, p_fim) s
                 where s.modelo_id = p_modelo_id), 0))::int;
$$;

-- Igual à 20261002110000, com a procura sem viatura descontada (CTE saldo).
create or replace function public.api_disponibilidade(
  p_org_id uuid, p_inicio timestamptz, p_fim timestamptz, p_entrega uuid, p_recolha uuid,
  p_categoria uuid default null, p_tipo text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_erro jsonb := public.api_validar_periodo(p_org_id, p_inicio, p_fim, p_entrega, p_recolha);
  v_dias int; v_iva numeric; v_tarifa uuid;
begin
  if v_erro is not null then return v_erro; end if;
  v_dias := public.api_dias(p_inicio, p_fim);
  v_iva := public.api_iva_rent_a_car(p_org_id);
  v_tarifa := public.api_tarifa_site(p_org_id);
  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'dias', v_dias),
    'modelos', coalesce((
      with livres as (
        select l.modelo_id, count(*)::int as q
          from public.api_viaturas_livres(p_org_id, p_inicio, p_fim) l
         group by l.modelo_id
      ), saldo as (
        select l.modelo_id, l.q - coalesce(sv.n, 0) as q
          from livres l
          left join public.api_procura_sem_viatura(p_org_id, p_inicio, p_fim) sv
            on sv.modelo_id = l.modelo_id
      ), cartoes as (
        select x as cartao, (x->>'id')::uuid as modelo_id
          from jsonb_array_elements(public.api_modelos(p_org_id, p_categoria, p_tipo)) x
      )
      select jsonb_agg(c.cartao || jsonb_build_object(
               'quantidade_disponivel', s.q,
               'cotacao', jsonb_build_object(
                 'dias', v_dias,
                 'preco_dia', public.api_preco_json(pr.preco_dia, v_iva),
                 'aluguer', public.api_preco_json(pr.preco_dia * v_dias, v_iva),
                 'franquia', public.api_preco_json(pr.franquia_valor, v_iva),
                 'caucao', public.api_preco_json(pr.caucao_valor, v_iva),
                 'km_incluidos', pr.km_mensal))
             order by c.cartao->>'marca', c.cartao->>'modelo')
        from cartoes c
        join saldo s on s.modelo_id = c.modelo_id and s.q > 0
        join public.renting_tarifa_precos_modelo pr
          on pr.modelo_id = c.modelo_id and pr.tarifa_id = v_tarifa and pr.org_id = p_org_id
    ), '[]'::jsonb));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'api_procura_sem_viatura(uuid, timestamptz, timestamptz)',
    'api_quantidade_disponivel(uuid, uuid, timestamptz, timestamptz)',
    'api_disponibilidade(uuid, timestamptz, timestamptz, uuid, uuid, uuid, text)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
