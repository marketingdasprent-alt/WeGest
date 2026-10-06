-- ============================================================
-- Catálogo e disponibilidade TVDE da API do site (Fase D1)
-- ============================================================
-- Tarifa do site por tipo (renting/tvde), cartões TVDE com IVA TVDE,
-- disponibilidade aberta (inicio até 'infinity') só com viaturas de tipo
-- elegível. Fixture ao padrão de api_disponibilidade.test.sql.
-- Datas relativas a now(): nunca dependem do dia da semana.
-- ============================================================
begin;
select plan(70);

-- Bootstrap antes das organizações: consome a vaga do primeiro utilizador.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000e1d01ff', 'bootstrap@tvdecat.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000e1d0a00', 'Org TVDE A', 'tvdecat-a'),
  ('00000000-0000-0000-0000-00000e1d0b00', 'Org TVDE B', 'tvdecat-b');
insert into public.org_definicoes (org_id, iva_rent_a_car, iva_tvde) values ('00000000-0000-0000-0000-00000e1d0a00', 23, 6)
  on conflict (org_id) do update set iva_rent_a_car = 23, iva_tvde = 6;

insert into public.viatura_tipos (id, org_id, nome, elegivel_tvde) values
  ('00000000-0000-0000-0000-00000e1d0701', '00000000-0000-0000-0000-00000e1d0a00', 'PASSAGEIROS', true),
  ('00000000-0000-0000-0000-00000e1d0702', '00000000-0000-0000-0000-00000e1d0a00', 'COMERCIAL', false),
  ('00000000-0000-0000-0000-00000e1d07b1', '00000000-0000-0000-0000-00000e1d0b00', 'PASSAGEIROS', true);
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000e1d0aa1', '00000000-0000-0000-0000-00000e1d0a00', 'Toyota'),
  ('00000000-0000-0000-0000-00000e1d0ab1', '00000000-0000-0000-0000-00000e1d0b00', 'Toyota');
-- d01 Corolla elegível, d02 Proace comercial, d03 Yaris elegível mas sem preço/semana.
insert into public.viatura_modelos (id, org_id, marca_id, nome, caixa, lugares, portas, bagageira) values
  ('00000000-0000-0000-0000-00000e1d0d01', '00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0aa1', 'Corolla', 'automatica', 5, 5, 3),
  ('00000000-0000-0000-0000-00000e1d0d02', '00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0aa1', 'Proace', 'manual', 3, 4, 10),
  ('00000000-0000-0000-0000-00000e1d0d03', '00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0aa1', 'Yaris', 'automatica', 5, 5, 2),
  ('00000000-0000-0000-0000-00000e1d0db1', '00000000-0000-0000-0000-00000e1d0b00', '00000000-0000-0000-0000-00000e1d0ab1', 'Corolla', 'automatica', 5, 5, 3);
insert into public.renting_grupos (id, org_id, nome, codigo, ativo) values
  ('00000000-0000-0000-0000-00000e1d0101', '00000000-0000-0000-0000-00000e1d0a00', 'Berlina', 'BER', true);
-- Corolla: e01-e03 elegíveis, e06 do mesmo modelo mas COMERCIAL (nunca conta no TVDE).
-- Proace e04 comercial; Yaris e05 elegível. Org B: eb1.
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, grupo_id, tipo_id, is_slot) values
  ('00000000-0000-0000-0000-00000e1d0e01', '00000000-0000-0000-0000-00000e1d0a00', 'TA-01-AA', '00000000-0000-0000-0000-00000e1d0aa1', '00000000-0000-0000-0000-00000e1d0d01', '00000000-0000-0000-0000-00000e1d0101', '00000000-0000-0000-0000-00000e1d0701', false),
  ('00000000-0000-0000-0000-00000e1d0e02', '00000000-0000-0000-0000-00000e1d0a00', 'TA-02-AA', '00000000-0000-0000-0000-00000e1d0aa1', '00000000-0000-0000-0000-00000e1d0d01', '00000000-0000-0000-0000-00000e1d0101', '00000000-0000-0000-0000-00000e1d0701', false),
  ('00000000-0000-0000-0000-00000e1d0e03', '00000000-0000-0000-0000-00000e1d0a00', 'TA-03-AA', '00000000-0000-0000-0000-00000e1d0aa1', '00000000-0000-0000-0000-00000e1d0d01', '00000000-0000-0000-0000-00000e1d0101', '00000000-0000-0000-0000-00000e1d0701', false),
  ('00000000-0000-0000-0000-00000e1d0e04', '00000000-0000-0000-0000-00000e1d0a00', 'TA-04-AA', '00000000-0000-0000-0000-00000e1d0aa1', '00000000-0000-0000-0000-00000e1d0d02', '00000000-0000-0000-0000-00000e1d0101', '00000000-0000-0000-0000-00000e1d0702', false),
  ('00000000-0000-0000-0000-00000e1d0e05', '00000000-0000-0000-0000-00000e1d0a00', 'TA-05-AA', '00000000-0000-0000-0000-00000e1d0aa1', '00000000-0000-0000-0000-00000e1d0d03', '00000000-0000-0000-0000-00000e1d0101', '00000000-0000-0000-0000-00000e1d0701', false),
  ('00000000-0000-0000-0000-00000e1d0e06', '00000000-0000-0000-0000-00000e1d0a00', 'TA-06-AA', '00000000-0000-0000-0000-00000e1d0aa1', '00000000-0000-0000-0000-00000e1d0d01', '00000000-0000-0000-0000-00000e1d0101', '00000000-0000-0000-0000-00000e1d0702', false),
  ('00000000-0000-0000-0000-00000e1d0eb1', '00000000-0000-0000-0000-00000e1d0b00', 'TB-01-AA', '00000000-0000-0000-0000-00000e1d0ab1', '00000000-0000-0000-0000-00000e1d0db1', null, '00000000-0000-0000-0000-00000e1d07b1', false);
insert into public.estacoes (id, org_id, nome, cidade, ativa) values
  ('00000000-0000-0000-0000-00000e1d0301', '00000000-0000-0000-0000-00000e1d0a00', 'Leiria', 'Leiria', true);
insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000e1d0c01', '00000000-0000-0000-0000-00000e1d0a00', 'Motorista TVDE Um');

-- Tarifa do site de rent-a-car (sem validade: vale sempre).
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site) values
  ('00000000-0000-0000-0000-00000e1d0f01', '00000000-0000-0000-0000-00000e1d0a00', 'Geral', 'renting', true, true);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_dia, franquia_valor, caucao_valor, km_mensal) values
  ('00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0f01', '00000000-0000-0000-0000-00000e1d0d01', 40.00, 800, 300, 3000),
  ('00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0f01', '00000000-0000-0000-0000-00000e1d0d02', 60.00, 1000, 400, 3000);

-- Inicio de referência: daqui a 2 dias às 10h de Lisboa.
create temp table p as select
  ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '2 days 10 hours') at time zone 'Europe/Lisbon') as inicio;
grant select on p to public;

-- O rent-a-car antes de existir tarifa TVDE do site.
create temp table antes as select public.api_modelos('00000000-0000-0000-0000-00000e1d0a00') as r;
grant select on antes to public;

-- 1) tarifa do site: uma por organização e por tipo
select lives_ok(
  $$ insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site)
     values ('00000000-0000-0000-0000-00000e1d0f02', '00000000-0000-0000-0000-00000e1d0a00', 'TVDE Site', 'tvde', true, true) $$,
  'uma tarifa do site renting e uma tvde convivem na mesma org');
select throws_ok(
  $$ insert into public.renting_tarifas (org_id, nome, tipo, ativa, tarifa_site)
     values ('00000000-0000-0000-0000-00000e1d0a00', 'TVDE Outra', 'tvde', true, true) $$,
  '23505', null, 'duas tarifas tvde do site activas na mesma org são recusadas');
select throws_ok(
  $$ insert into public.renting_tarifas (org_id, nome, tipo, ativa, tarifa_site)
     values ('00000000-0000-0000-0000-00000e1d0a00', 'Renting Outra', 'renting', true, true) $$,
  '23505', null, 'duas tarifas renting do site activas continuam recusadas');

-- Preços TVDE: o Corolla leva também preco_dia 99 como armadilha para o rent-a-car.
insert into public.renting_tarifa_precos_modelo
  (org_id, tarifa_id, modelo_id, preco_semana, caucao_valor, franquia_valor, km_mensal, km_adicional_valor, preco_dia) values
  ('00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0f02', '00000000-0000-0000-0000-00000e1d0d01', 250.00, 500, 1000, 6000, 0.10, 99),
  ('00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0f02', '00000000-0000-0000-0000-00000e1d0d02', 300.00, 500, 1000, 6000, 0.10, 99),
  ('00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0f02', '00000000-0000-0000-0000-00000e1d0d03', null, 400, 900, 6000, 0.10, null);

-- 2) cada lado lê a sua tarifa
select is(public.api_tarifa_site('00000000-0000-0000-0000-00000e1d0a00'), '00000000-0000-0000-0000-00000e1d0f01'::uuid,
  'api_tarifa_site devolve a tarifa renting');
select is(public.api_tarifa_site_tvde('00000000-0000-0000-0000-00000e1d0a00'), '00000000-0000-0000-0000-00000e1d0f02'::uuid,
  'api_tarifa_site_tvde devolve a tarifa tvde');

-- 3) regressão do rent-a-car
select is(public.api_modelos('00000000-0000-0000-0000-00000e1d0a00'), (select r from antes),
  'api_modelos de rent-a-car não muda com a tarifa TVDE do site');
select is((select x->'preco_dia'->>'sem_iva' from jsonb_array_elements(public.api_modelos('00000000-0000-0000-0000-00000e1d0a00')) x
            where x->>'id' = '00000000-0000-0000-0000-00000e1d0d01'), '40.00',
  'o preço/dia do Corolla vem da tarifa renting, não da tvde');

-- 4) e 5) cartões TVDE
create temp table m as select public.api_tvde_modelos('00000000-0000-0000-0000-00000e1d0a00') as r;
grant select on m to public;
select is((select jsonb_array_length(r) from m), 1, 'api_tvde_modelos só traz o Corolla');
select is((select r->0->>'id' from m), '00000000-0000-0000-0000-00000e1d0d01', 'o modelo é o Corolla');
select is((select r->0->'preco_semana'->>'sem_iva' from m), '250.00', 'preço/semana sem IVA');
select is((select r->0->'preco_semana'->>'com_iva' from m), '265.00', 'preço/semana com IVA TVDE a 6%');
select is((select r->0->'caucao'->>'com_iva' from m), '530.00', 'caução com IVA TVDE');
select is((select r->0->'franquia'->>'sem_iva' from m), '1000.00', 'franquia sem IVA');
select is((select r->0->>'km_incluidos' from m), '6000', 'km incluídos vêm de km_mensal');
select is((select r->0->'km_adicional'->>'sem_iva' from m), '0.10', 'km adicional sem IVA');
select is((select r->0->>'frota' from m), '3', 'frota conta só as viaturas elegíveis (e06 comercial fora)');
select ok(not exists (select 1 from m, jsonb_array_elements(m.r) x where x->>'id' = '00000000-0000-0000-0000-00000e1d0d02'),
  'modelo comercial nunca aparece, mesmo com preço na tarifa TVDE');
select ok(not exists (select 1 from m, jsonb_array_elements(m.r) x where x->>'id' = '00000000-0000-0000-0000-00000e1d0d03'),
  'modelo com preco_semana nulo não aparece');
select is(public.api_tvde_modelo('00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0d01')->>'modelo', 'Corolla',
  'api_tvde_modelo devolve o cartão do Corolla');
select is(public.api_tvde_modelo('00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0d02'), null,
  'api_tvde_modelo de um modelo comercial é null');
select is(public.api_tvde_modelo('00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0d03'), null,
  'api_tvde_modelo de um modelo sem preço/semana é null');

-- Viaturas elegíveis: e01, e02, e03 e e05.
select is((select count(*)::int from public.api_tvde_viaturas_elegiveis('00000000-0000-0000-0000-00000e1d0a00')), 4,
  'quatro viaturas elegíveis na org A');
select ok(not exists (select 1 from public.api_tvde_viaturas_elegiveis('00000000-0000-0000-0000-00000e1d0a00')
                       where viatura_id = '00000000-0000-0000-0000-00000e1d0e06'),
  'Corolla de tipo COMERCIAL não é elegível');

-- 6) disponibilidade aberta
select is(jsonb_array_length(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0a00', (select inicio from p))->'modelos'), 1,
  'só o Corolla está disponível');
select is(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0a00', (select inicio from p))->'modelos'->0->>'quantidade_disponivel', '3',
  'três Corolla elegíveis livres');

-- Reserva rent-a-car daqui a 90 dias na e01: sai do TVDE de agora, não do rent-a-car desta semana.
insert into public.reservas (org_id, viatura_id, data_inicio, data_fim) values
  ('00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0e01',
   (select inicio from p) + interval '90 days', (select inicio from p) + interval '93 days');
select is(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0a00', (select inicio from p))->'modelos'->0->>'quantidade_disponivel', '2',
  'reserva daqui a 90 dias tira a viatura da disponibilidade TVDE');
select is((select x->>'quantidade_disponivel'
             from jsonb_array_elements(public.api_disponibilidade('00000000-0000-0000-0000-00000e1d0a00',
                    (select inicio from p), (select inicio from p) + interval '3 days',
                    '00000000-0000-0000-0000-00000e1d0301', '00000000-0000-0000-0000-00000e1d0301')->'modelos') x
            where x->>'id' = '00000000-0000-0000-0000-00000e1d0d01'), '4',
  'a mesma reserva não tira a viatura do rent-a-car desta semana (e01, e02, e03 e e06)');

insert into public.motorista_viaturas (org_id, motorista_id, viatura_id, data_inicio, data_fim, status) values
  ('00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0c01', '00000000-0000-0000-0000-00000e1d0e02',
   (now() - interval '30 days')::date, null, 'ativo');
select is(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0a00', (select inicio from p))->'modelos'->0->>'quantidade_disponivel', '1',
  'motorista TVDE activo tira a viatura');

insert into public.reservas (org_id, modelo_id, data_inicio, data_fim) values
  ('00000000-0000-0000-0000-00000e1d0a00', '00000000-0000-0000-0000-00000e1d0d01',
   (select inicio from p) + interval '30 days', (select inicio from p) + interval '37 days');
select is(jsonb_array_length(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0a00', (select inicio from p))->'modelos'), 0,
  'reserva sem viatura do modelo esgota o Corolla e o modelo sai da lista');

-- 7) período
select is(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0a00', now() - interval '1 day')->'erro'->>'codigo',
  'PERIODO_INVALIDO', 'inicio no passado');
select is(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0a00', now() + interval '200 days')->'erro'->>'codigo',
  'PERIODO_INVALIDO', 'inicio a 200 dias');
select is(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0a00', null)->'erro'->>'codigo',
  'PERIODO_INVALIDO', 'inicio nulo');

-- 8) sem tarifa TVDE do site
select is(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0b00', (select inicio from p))->'erro'->>'codigo',
  'CONFIG_EM_FALTA', 'org sem tarifa TVDE do site');
select is(public.api_tvde_modelos('00000000-0000-0000-0000-00000e1d0b00'), '[]'::jsonb,
  'org sem tarifa TVDE do site: catálogo vazio, nunca erro');

-- 8b) tarifa TVDE fora da validade em inicio
update public.renting_tarifas set valido_de = ((select inicio from p) at time zone 'Europe/Lisbon')::date + 1
 where id = '00000000-0000-0000-0000-00000e1d0f02';
select is(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0a00', (select inicio from p))->'erro'->>'codigo',
  'TARIFA_INDISPONIVEL', 'tarifa TVDE que só começa depois de inicio');
update public.renting_tarifas set valido_de = null, valido_ate = ((select inicio from p) at time zone 'Europe/Lisbon')::date - 1
 where id = '00000000-0000-0000-0000-00000e1d0f02';
select is(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0a00', (select inicio from p))->'erro'->>'codigo',
  'TARIFA_INDISPONIVEL', 'tarifa TVDE que já acabou antes de inicio');
update public.renting_tarifas set valido_ate = null where id = '00000000-0000-0000-0000-00000e1d0f02';

-- 9) isolamento: a org B tem a sua tarifa e uma linha de preço a apontar para o Corolla da A.
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site) values
  ('00000000-0000-0000-0000-00000e1d0fb1', '00000000-0000-0000-0000-00000e1d0b00', 'TVDE B', 'tvde', true, true);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_semana) values
  ('00000000-0000-0000-0000-00000e1d0b00', '00000000-0000-0000-0000-00000e1d0fb1', '00000000-0000-0000-0000-00000e1d0db1', 200.00),
  ('00000000-0000-0000-0000-00000e1d0b00', '00000000-0000-0000-0000-00000e1d0fb1', '00000000-0000-0000-0000-00000e1d0d01', 150.00);
select is(public.api_tarifa_site('00000000-0000-0000-0000-00000e1d0b00'), null, 'org B sem tarifa renting do site');
select is(jsonb_array_length(public.api_tvde_modelos('00000000-0000-0000-0000-00000e1d0b00')), 1, 'org B vê só um modelo');
select is(public.api_tvde_modelos('00000000-0000-0000-0000-00000e1d0b00')->0->>'id', '00000000-0000-0000-0000-00000e1d0db1',
  'e é o seu Corolla, não o da org A');
select is(public.api_tvde_modelo('00000000-0000-0000-0000-00000e1d0b00', '00000000-0000-0000-0000-00000e1d0d01'), null,
  'org B não obtém o cartão do modelo da org A');
select is((select array_agg(viatura_id) from public.api_tvde_viaturas_elegiveis('00000000-0000-0000-0000-00000e1d0b00')),
  array['00000000-0000-0000-0000-00000e1d0eb1'::uuid], 'org B só vê a sua viatura');
select is(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000e1d0b00', (select inicio from p))->'modelos',
  jsonb_build_array(public.api_tvde_modelos('00000000-0000-0000-0000-00000e1d0b00')->0 || '{"quantidade_disponivel": 1}'::jsonb),
  'disponibilidade da org B só com o seu Corolla');
select ok(not exists (select 1 from jsonb_array_elements(public.api_tvde_modelos('00000000-0000-0000-0000-00000e1d0a00')) x
                       where x->>'id' = '00000000-0000-0000-0000-00000e1d0db1'),
  'org A não vê o modelo da org B');

-- 10) privilégios: só service_role executa (uma linha TAP por função)
create temp table fns as select unnest(array[
  'public.api_tarifa_site(uuid)',
  'public.api_tarifa_site_tvde(uuid)',
  'public.api_iva_tvde(uuid)',
  'public.api_tvde_viaturas_elegiveis(uuid)',
  'public.api_tvde_modelos_publicaveis(uuid)',
  'public.api_tvde_modelos(uuid)',
  'public.api_tvde_modelo(uuid,uuid)',
  'public.api_tvde_disponibilidade(uuid,timestamptz)']) as f;
grant select on fns to public;
select ok(not has_function_privilege('anon', f, 'EXECUTE'), 'anon não executa ' || f) from fns;
select ok(not has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated não executa ' || f) from fns;
select ok(has_function_privilege('service_role', f, 'EXECUTE'), 'service_role executa ' || f) from fns;
select ok(has_function_privilege('authenticated', 'public.api_chaves_criar(text,text,text[],timestamptz,text[])', 'EXECUTE'),
  'api_chaves_criar continua executável pelo browser (admin)');

-- 11) permissão nova na whitelist das chaves (fixture de api_chaves.test.sql)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000e1d0201', 'admin@tvdecat.pt');
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-00000e1d0201', '00000000-0000-0000-0000-00000e1d0a00');
insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-00000e1d0201', '00000000-0000-0000-0000-00000e1d0a00', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000e1d0201","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.api_chaves_criar('Site TVDE', 'rent_a_car', array['catalogo:read', 'tvde:catalogo:read'], null, null) $$,
  'api_chaves_criar aceita tvde:catalogo:read');
select throws_ok(
  $$ select * from public.api_chaves_criar('Site X', 'rent_a_car', array['tvde:xpto'], null, null) $$,
  'P0001', 'Permissão desconhecida', 'api_chaves_criar recusa tvde:xpto');

select * from finish();
rollback;
