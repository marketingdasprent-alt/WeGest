-- supabase/tests/dashboard_resumo_plataformas.test.sql
begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000040000', 'Org Dashboard A', 'dash-a'),
  ('00000000-0000-0000-0000-000000040001', 'Org Dashboard B', 'dash-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000040a01', 'financeiro@dash-a.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000040a01', '00000000-0000-0000-0000-000000040000', true)
on conflict (user_id, org_id) do update set is_admin = true;

-- Receita: Bolt e Uber, dentro do periodo 2026-09-01..2026-09-07
insert into public.bolt_resumos_semanais (org_id, motorista_id, periodo_inicio, periodo_fim, ganhos_brutos_total, ganhos_liquidos, comissoes) values
  ('00000000-0000-0000-0000-000000040000', gen_random_uuid(), '2026-09-01', '2026-09-07', 1000, 850, 150);
insert into public.uber_resumos_semanais (org_id, motorista_id, periodo_inicio, periodo_fim, integracao_id, ganhos_brutos, ganhos_liquidos, comissoes) values
  ('00000000-0000-0000-0000-000000040000', gen_random_uuid(), '2026-09-01', '2026-09-07', gen_random_uuid(), 900, 750, 150);

-- Custos, dentro do periodo
insert into public.bp_transacoes (org_id, transaction_date, amount) values
  ('00000000-0000-0000-0000-000000040000', '2026-09-03 10:00:00+00', 100);
insert into public.repsol_transacoes (org_id, transaction_date, amount) values
  ('00000000-0000-0000-0000-000000040000', '2026-09-03 10:00:00+00', 80);

-- Dados de outra org, dentro do mesmo periodo — nao pode entrar na soma
insert into public.bp_transacoes (org_id, transaction_date, amount) values
  ('00000000-0000-0000-0000-000000040001', '2026-09-03 10:00:00+00', 9999);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000040a01', 'role', 'authenticated')::text, true);

select is(
  (select valor from public.dashboard_resumo_plataformas('00000000-0000-0000-0000-000000040000', '2026-09-01', '2026-09-07') where plataforma = 'Bolt'),
  850::numeric,
  'Bolt soma ganhos_liquidos dentro do periodo'
);

select is(
  (select valor from public.dashboard_resumo_plataformas('00000000-0000-0000-0000-000000040000', '2026-09-01', '2026-09-07') where plataforma = 'Uber'),
  750::numeric,
  'Uber soma ganhos_liquidos dentro do periodo'
);

select is(
  (select valor from public.dashboard_resumo_plataformas('00000000-0000-0000-0000-000000040000', '2026-09-01', '2026-09-07') where plataforma = 'BP'),
  100::numeric,
  'BP soma so os dados da propria org — 100, nao 9999+100'
);

select is(
  (select valor from public.dashboard_resumo_plataformas('00000000-0000-0000-0000-000000040000', '2026-09-01', '2026-09-07') where plataforma = 'Repsol'),
  80::numeric,
  'Repsol soma amount dentro do periodo'
);

select is(
  (select valor from public.dashboard_resumo_plataformas('00000000-0000-0000-0000-000000040000', '2026-09-01', '2026-09-07') where plataforma = 'Via Verde'),
  0::numeric,
  'plataforma sem dados no periodo devolve 0, nao erro'
);

reset role;
insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000040a01', '00000000-0000-0000-0000-000000040001', false)
on conflict (user_id, org_id) do update set is_admin = false;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000040a01', 'role', 'authenticated')::text, true);

select throws_ok(
  $$select * from public.dashboard_resumo_plataformas('00000000-0000-0000-0000-000000040000', '2026-09-01', '2026-09-07')$$,
  'insufficient_privilege',
  'org invalida',
  'pedir o resumo de uma org que nao e a activa do utilizador falha'
);

select * from finish();
rollback;
