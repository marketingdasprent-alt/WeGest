-- ============================================================
-- API do site: não vende viaturas que estão com alguém (20261028120000)
-- ============================================================
-- Contrato em curso ocupa a viatura desde já, mesmo com o período no futuro
-- (renovação em duplicado) ou vencido; 'em_uso' posto à mão sem contrato nem
-- motorista tira a viatura de qualquer período. Contrato ou motorista a acabar
-- antes do período continuam a deixá-la vender. Datas relativas a now().
-- ============================================================
begin;
select plan(10);

-- Bootstrap antes da organização: consome a vaga do primeiro utilizador.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000e7501ff', 'bootstrap@emuso.pt'),
  ('00000000-0000-0000-0000-00000e7502ff', 'gestor@emuso.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000e750a00', 'Org EmUso', 'emuso-a');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000e750aa1', '00000000-0000-0000-0000-00000e750a00', 'Fiat');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-00000e750d01', '00000000-0000-0000-0000-00000e750a00', '00000000-0000-0000-0000-00000e750aa1', 'Ducato');
-- g01 contrato em curso com o período no futuro, g02 contrato em curso vencido,
-- g03 contrato em curso a acabar antes do período, g04 em_uso à mão,
-- g05 em_uso com motorista a acabar antes do período, g06 sem nada.
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, is_slot, status) values
  ('00000000-0000-0000-0000-00000e750e01', '00000000-0000-0000-0000-00000e750a00', 'EU-01-AA', '00000000-0000-0000-0000-00000e750aa1', '00000000-0000-0000-0000-00000e750d01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000e750e02', '00000000-0000-0000-0000-00000e750a00', 'EU-02-AA', '00000000-0000-0000-0000-00000e750aa1', '00000000-0000-0000-0000-00000e750d01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000e750e03', '00000000-0000-0000-0000-00000e750a00', 'EU-03-AA', '00000000-0000-0000-0000-00000e750aa1', '00000000-0000-0000-0000-00000e750d01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000e750e04', '00000000-0000-0000-0000-00000e750a00', 'EU-04-AA', '00000000-0000-0000-0000-00000e750aa1', '00000000-0000-0000-0000-00000e750d01', false, 'em_uso'),
  ('00000000-0000-0000-0000-00000e750e05', '00000000-0000-0000-0000-00000e750a00', 'EU-05-AA', '00000000-0000-0000-0000-00000e750aa1', '00000000-0000-0000-0000-00000e750d01', false, 'em_uso'),
  ('00000000-0000-0000-0000-00000e750e06', '00000000-0000-0000-0000-00000e750a00', 'EU-06-AA', '00000000-0000-0000-0000-00000e750aa1', '00000000-0000-0000-0000-00000e750d01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000e750e07', '00000000-0000-0000-0000-00000e750a00', 'EU-07-AA', '00000000-0000-0000-0000-00000e750aa1', '00000000-0000-0000-0000-00000e750d01', false, 'disponivel');

-- Cliente sem motorista ligado: contrato_renting_liga_motorista_open não cria atribuições.
insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000e750c01', '00000000-0000-0000-0000-00000e750a00', 'Cliente EmUso');

-- Período: 3 dias a começar daqui a 5 dias, às 10h de Lisboa.
create temp table p as select
  ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '5 days 10 hours') at time zone 'Europe/Lisbon') as inicio,
  ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '8 days 10 hours') at time zone 'Europe/Lisbon') as fim;
grant select on p to public;

-- reserva_id é NOT NULL; 'concluida' porque já virou contrato.
insert into public.reservas (id, org_id, data_inicio, viatura_id, cliente_id, estado) values
  ('00000000-0000-0000-0000-00000e750b01', '00000000-0000-0000-0000-00000e750a00', now() + interval '20 days',
   '00000000-0000-0000-0000-00000e750e01', '00000000-0000-0000-0000-00000e750c01', 'concluida'),
  ('00000000-0000-0000-0000-00000e750b02', '00000000-0000-0000-0000-00000e750a00', now() - interval '40 days',
   '00000000-0000-0000-0000-00000e750e02', '00000000-0000-0000-0000-00000e750c01', 'concluida'),
  ('00000000-0000-0000-0000-00000e750b03', '00000000-0000-0000-0000-00000e750a00', now() - interval '10 days',
   '00000000-0000-0000-0000-00000e750e03', '00000000-0000-0000-0000-00000e750c01', 'concluida'),
  ('00000000-0000-0000-0000-00000e750b07', '00000000-0000-0000-0000-00000e750a00', now() - interval '28 days',
   '00000000-0000-0000-0000-00000e750e07', '00000000-0000-0000-0000-00000e750c01', 'concluida');
insert into public.contratos_renting
  (org_id, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao, created_by)
values
  ('00000000-0000-0000-0000-00000e750a00', '00000000-0000-0000-0000-00000e750b01', '00000000-0000-0000-0000-00000e750c01',
   '00000000-0000-0000-0000-00000e750e01', 'EU-01-AA', now() + interval '20 days', now() + interval '50 days',
   'em_curso', 'pendente', 'rent_a_car', 23, false, '00000000-0000-0000-0000-00000e7502ff'),
  ('00000000-0000-0000-0000-00000e750a00', '00000000-0000-0000-0000-00000e750b02', '00000000-0000-0000-0000-00000e750c01',
   '00000000-0000-0000-0000-00000e750e02', 'EU-02-AA', now() - interval '40 days', now() - interval '2 days',
   'em_curso', 'pendente', 'rent_a_car', 23, false, '00000000-0000-0000-0000-00000e7502ff'),
  ('00000000-0000-0000-0000-00000e750a00', '00000000-0000-0000-0000-00000e750b03', '00000000-0000-0000-0000-00000e750c01',
   '00000000-0000-0000-0000-00000e750e03', 'EU-03-AA', now() - interval '10 days', now() + interval '2 days',
   'em_curso', 'pendente', 'rent_a_car', 23, false, '00000000-0000-0000-0000-00000e7502ff'),
  -- Mensal com o período a acabar antes do pedido: renova-se, por isso continua ocupada (20261029090000).
  ('00000000-0000-0000-0000-00000e750a00', '00000000-0000-0000-0000-00000e750b07', '00000000-0000-0000-0000-00000e750c01',
   '00000000-0000-0000-0000-00000e750e07', 'EU-07-AA', now() - interval '28 days', now() + interval '2 days',
   'em_curso', 'pendente', 'rent_a_car', 23, true, '00000000-0000-0000-0000-00000e7502ff');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000e750f01', '00000000-0000-0000-0000-00000e750a00', 'Motorista EmUso');
insert into public.motorista_viaturas (org_id, motorista_id, viatura_id, data_inicio, data_fim, status) values
  ('00000000-0000-0000-0000-00000e750a00', '00000000-0000-0000-0000-00000e750f01', '00000000-0000-0000-0000-00000e750e05',
   (now() - interval '30 days')::date, (now() + interval '2 days')::date, 'ativo');

create temp table l as select viatura_id from public.api_viaturas_livres(
  '00000000-0000-0000-0000-00000e750a00', (select inicio from p), (select fim from p));
grant select on l to public;

select ok(not exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-00000e750e01'),
  'contrato em curso com o período no futuro (renovação em duplicado) tira a viatura já');
select ok(not exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-00000e750e02'),
  'contrato em curso vencido continua a tirar a viatura');
select ok(exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-00000e750e03'),
  'contrato curto em curso a acabar antes do período não tira a viatura');
select ok(not exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-00000e750e07'),
  'contrato mensal em curso tira a viatura mesmo com o período a acabar antes: renova-se');
select ok(not exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-00000e750e04'),
  'em_uso posto à mão, sem contrato nem motorista, tira a viatura');
select ok(exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-00000e750e05'),
  'em_uso com motorista a acabar antes do período não tira a viatura');
select ok(exists (select 1 from l where viatura_id = '00000000-0000-0000-0000-00000e750e06'),
  'viatura sem contrato nem motorista fica livre');

-- Voltar a pôr 'disponivel' devolve-a ao site.
update public.viaturas set status = 'disponivel' where id = '00000000-0000-0000-0000-00000e750e04';
select ok(exists (select 1 from public.api_viaturas_livres('00000000-0000-0000-0000-00000e750a00',
  (select inicio from p), (select fim from p)) where viatura_id = '00000000-0000-0000-0000-00000e750e04'),
  'tirar o em_uso devolve a viatura ao site');

select ok(not has_function_privilege('anon', 'public.api_viaturas_livres(uuid,timestamptz,timestamptz)', 'execute'),
  'anon continua sem executar api_viaturas_livres');
select ok(has_function_privilege('service_role', 'public.api_viaturas_livres(uuid,timestamptz,timestamptz)', 'execute'),
  'service_role continua a executar api_viaturas_livres');

select * from finish();
rollback;
