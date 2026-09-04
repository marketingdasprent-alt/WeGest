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

-- get_current_org_id() le user_org_ativa (org "activa" da sessao), NAO
-- user_organizacoes — sem esta linha, todas as chamadas abaixo cairiam na
-- guarda "org invalida" mesmo com a membership certa. Ver
-- rls_org_isolation.test.sql:87-89 e acordos_pagamento.test.sql:34-38.
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-000000040a01', '00000000-0000-0000-0000-000000040000')
on conflict (user_id) do update set org_id = excluded.org_id;

-- Receita: Bolt e Uber, dentro do periodo 2026-09-01..2026-09-07
-- integracao_id em ambas as tabelas e NOT NULL (FK para
-- plataformas_configuracao) — precisa de uma linha real, nao de um
-- gen_random_uuid() solto.
-- periodo (text) e NOT NULL nas duas tabelas; uber_resumos_semanais tambem
-- exige chave_motorista e fonte. motorista_id pode ser um uuid qualquer:
-- o trigger resolver_motorista (tg_resolver_motorista_plataforma) resolve-o
-- sempre a partir de identificador_motorista/uber_driver_id (aqui ausentes),
-- por isso reescreve-o para NULL antes do insert — nunca viola a FK.
-- viagens_terminadas > 0 no Bolt: trg_bolt_recusa_ganhos_sem_atividade
-- recusa ganhos_liquidos > 0 sem nenhuma metrica de atividade (assinatura de
-- CSV da semana errada); sem isto o insert falhava com "Bolt: ... EUR de
-- ganhos sem atividade".
insert into public.plataformas_configuracao (id, org_id, plataforma, nome) values
  ('00000000-0000-0000-0000-000000040b01', '00000000-0000-0000-0000-000000040000', 'bolt', 'Bolt Dashboard Test'),
  ('00000000-0000-0000-0000-000000040b02', '00000000-0000-0000-0000-000000040000', 'uber', 'Uber Dashboard Test'),
  ('00000000-0000-0000-0000-000000040b03', '00000000-0000-0000-0000-000000040000', 'bp', 'BP Dashboard Test'),
  ('00000000-0000-0000-0000-000000040b04', '00000000-0000-0000-0000-000000040001', 'bp', 'BP Dashboard Test Org B');
insert into public.bolt_resumos_semanais (org_id, motorista_id, periodo, periodo_inicio, periodo_fim, integracao_id, ganhos_brutos_total, ganhos_liquidos, comissoes, viagens_terminadas) values
  ('00000000-0000-0000-0000-000000040000', gen_random_uuid(), '2026-09-01 a 2026-09-07', '2026-09-01', '2026-09-07', '00000000-0000-0000-0000-000000040b01', 1000, 850, 150, 12);
insert into public.uber_resumos_semanais (org_id, motorista_id, periodo, periodo_inicio, periodo_fim, chave_motorista, fonte, integracao_id, ganhos_brutos, ganhos_liquidos, comissoes) values
  ('00000000-0000-0000-0000-000000040000', gen_random_uuid(), '2026-09-01 a 2026-09-07', '2026-09-01', '2026-09-07', 'dash-teste-motorista', 'csv', '00000000-0000-0000-0000-000000040b02', 900, 750, 150);

-- Custos, dentro do periodo. bp_transacoes.integracao_id (FK para
-- plataformas_configuracao) e transaction_id (UNIQUE com integracao_id) sao
-- NOT NULL; repsol so exige transaction_id.
insert into public.bp_transacoes (org_id, integracao_id, transaction_id, transaction_date, amount) values
  ('00000000-0000-0000-0000-000000040000', '00000000-0000-0000-0000-000000040b03', 'dash-bp-040000-001', '2026-09-03 10:00:00+00', 100);
insert into public.repsol_transacoes (org_id, transaction_id, transaction_date, amount) values
  ('00000000-0000-0000-0000-000000040000', 'dash-repsol-040000-001', '2026-09-03 10:00:00+00', 80);

-- Dados de outra org, dentro do mesmo periodo — nao pode entrar na soma
insert into public.bp_transacoes (org_id, integracao_id, transaction_id, transaction_date, amount) values
  ('00000000-0000-0000-0000-000000040001', '00000000-0000-0000-0000-000000040b04', 'dash-bp-040001-001', '2026-09-03 10:00:00+00', 9999);

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

-- Teste de negacao por permissao (nao por org): a org activa continua a ser
-- ...040000 (a mesma que se vai pedir, para passar a guarda de org), mas o
-- utilizador deixa de ser admin NESSA org e nunca teve cargo_id/
-- financeiro_recibos atribuido — por isso can_view_financeiro() tem de
-- devolver false e a segunda guarda e que deve disparar.
reset role;
insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000040a01', '00000000-0000-0000-0000-000000040000', false)
on conflict (user_id, org_id) do update set is_admin = false;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000040a01', 'role', 'authenticated')::text, true);

select throws_ok(
  $$select * from public.dashboard_resumo_plataformas('00000000-0000-0000-0000-000000040000', '2026-09-01', '2026-09-07')$$,
  'insufficient_privilege',
  'sem permissao para ver o resumo financeiro',
  'utilizador sem is_admin e sem financeiro_recibos na org activa nao pode ver o resumo'
);

select * from finish();
rollback;
