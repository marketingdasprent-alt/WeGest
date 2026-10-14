-- ============================================================
-- API do site: só mostra o que se pode alugar (20261014190000)
-- ============================================================
-- Rent-a-car: levantamento até 15 dias; a lista só traz modelos com um dia
-- livre nesse prazo, com disponivel_desde. TVDE: só o que está livre hoje.
-- Preço 0 na tarifa do site não é publicável. Fixture ao padrão de
-- api_disponibilidade.test.sql; datas relativas a now(), nunca ao dia da semana.
-- ============================================================
begin;
select plan(46);

-- Bootstrap antes das organizações: consome a vaga do primeiro utilizador.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000015d01ff', 'bootstrap@sodisp.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000015d0a00', 'Org SoDisp A', 'sodisp-a');
insert into public.org_definicoes (org_id, iva_rent_a_car, iva_tvde) values ('00000000-0000-0000-0000-0000015d0a00', 23, 6)
  on conflict (org_id) do update set iva_rent_a_car = 23, iva_tvde = 6;

insert into public.viatura_tipos (id, org_id, nome, elegivel_tvde) values
  ('00000000-0000-0000-0000-0000015d0701', '00000000-0000-0000-0000-0000015d0a00', 'PASSAGEIROS', true);
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000015d0aa1', '00000000-0000-0000-0000-0000015d0a00', 'Renault'),
  ('00000000-0000-0000-0000-0000015d0aa2', '00000000-0000-0000-0000-0000015d0a00', 'Toyota');
-- Rent-a-car: d01 Clio livre, d02 Captur ocupada até +4 dias, d03 Megane a 0 €, d04 Kadjar inactiva.
-- TVDE: d05 Corolla livre, d06 Yaris com motorista até +4 dias, d07 Auris a 0 €/semana.
insert into public.viatura_modelos (id, org_id, marca_id, nome, caixa, lugares, portas, bagageira) values
  ('00000000-0000-0000-0000-0000015d0d01', '00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0aa1', 'Clio', 'manual', 5, 5, 2),
  ('00000000-0000-0000-0000-0000015d0d02', '00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0aa1', 'Captur', 'automatica', 5, 5, 3),
  ('00000000-0000-0000-0000-0000015d0d03', '00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0aa1', 'Megane', 'manual', 5, 5, 3),
  ('00000000-0000-0000-0000-0000015d0d04', '00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0aa1', 'Kadjar', 'automatica', 5, 5, 3),
  ('00000000-0000-0000-0000-0000015d0d05', '00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0aa2', 'Corolla', 'automatica', 5, 5, 3),
  ('00000000-0000-0000-0000-0000015d0d06', '00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0aa2', 'Yaris', 'automatica', 5, 5, 2),
  ('00000000-0000-0000-0000-0000015d0d07', '00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0aa2', 'Auris', 'automatica', 5, 5, 3);
insert into public.renting_grupos (id, org_id, nome, codigo, ativo) values
  ('00000000-0000-0000-0000-0000015d0101', '00000000-0000-0000-0000-0000015d0a00', 'Citadino', 'CIT', true);
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, grupo_id, tipo_id, is_slot, status) values
  ('00000000-0000-0000-0000-0000015d0e01', '00000000-0000-0000-0000-0000015d0a00', 'SD-01-AA', '00000000-0000-0000-0000-0000015d0aa1', '00000000-0000-0000-0000-0000015d0d01', '00000000-0000-0000-0000-0000015d0101', null, false, 'disponivel'),
  ('00000000-0000-0000-0000-0000015d0e02', '00000000-0000-0000-0000-0000015d0a00', 'SD-02-AA', '00000000-0000-0000-0000-0000015d0aa1', '00000000-0000-0000-0000-0000015d0d02', '00000000-0000-0000-0000-0000015d0101', null, false, 'disponivel'),
  ('00000000-0000-0000-0000-0000015d0e03', '00000000-0000-0000-0000-0000015d0a00', 'SD-03-AA', '00000000-0000-0000-0000-0000015d0aa1', '00000000-0000-0000-0000-0000015d0d03', '00000000-0000-0000-0000-0000015d0101', null, false, 'disponivel'),
  ('00000000-0000-0000-0000-0000015d0e04', '00000000-0000-0000-0000-0000015d0a00', 'SD-04-AA', '00000000-0000-0000-0000-0000015d0aa1', '00000000-0000-0000-0000-0000015d0d04', '00000000-0000-0000-0000-0000015d0101', null, false, 'inativo'),
  ('00000000-0000-0000-0000-0000015d0e05', '00000000-0000-0000-0000-0000015d0a00', 'SD-05-AA', '00000000-0000-0000-0000-0000015d0aa2', '00000000-0000-0000-0000-0000015d0d05', '00000000-0000-0000-0000-0000015d0101', '00000000-0000-0000-0000-0000015d0701', false, 'disponivel'),
  ('00000000-0000-0000-0000-0000015d0e06', '00000000-0000-0000-0000-0000015d0a00', 'SD-06-AA', '00000000-0000-0000-0000-0000015d0aa2', '00000000-0000-0000-0000-0000015d0d06', '00000000-0000-0000-0000-0000015d0101', '00000000-0000-0000-0000-0000015d0701', false, 'em_uso'),
  ('00000000-0000-0000-0000-0000015d0e07', '00000000-0000-0000-0000-0000015d0a00', 'SD-07-AA', '00000000-0000-0000-0000-0000015d0aa2', '00000000-0000-0000-0000-0000015d0d07', '00000000-0000-0000-0000-0000015d0101', '00000000-0000-0000-0000-0000015d0701', false, 'disponivel');

-- Tarifas do site sem validade (valem sempre): só a regra dos 15 dias limita.
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site) values
  ('00000000-0000-0000-0000-0000015d0f01', '00000000-0000-0000-0000-0000015d0a00', 'Geral', 'renting', true, true),
  ('00000000-0000-0000-0000-0000015d0f02', '00000000-0000-0000-0000-0000015d0a00', 'TVDE Site', 'tvde', true, true);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_dia, franquia_valor, caucao_valor, km_mensal) values
  ('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0f01', '00000000-0000-0000-0000-0000015d0d01', 35.00, 800, 300, 3000),
  ('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0f01', '00000000-0000-0000-0000-0000015d0d02', 50.00, 1000, 400, 3000),
  ('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0f01', '00000000-0000-0000-0000-0000015d0d03', 0, 800, 300, 3000),
  ('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0f01', '00000000-0000-0000-0000-0000015d0d04', 45.00, 1000, 400, 3000);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_semana, caucao_valor, franquia_valor, km_mensal) values
  ('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0f02', '00000000-0000-0000-0000-0000015d0d05', 250.00, 500, 1000, 6000),
  ('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0f02', '00000000-0000-0000-0000-0000015d0d06', 230.00, 500, 1000, 6000),
  ('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0f02', '00000000-0000-0000-0000-0000015d0d07', 0, 500, 1000, 6000);
insert into public.estacoes (id, org_id, nome, cidade, ativa) values
  ('00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0a00', 'Leiria', 'Leiria', true);
insert into public.clientes (id, org_id, nome, tipo_cliente, is_emissora) values
  ('00000000-0000-0000-0000-0000015d0910', '00000000-0000-0000-0000-0000015d0a00', 'Emissora RAC', 'empresa', true);
update public.org_definicoes set emissor_rent_a_car_id = '00000000-0000-0000-0000-0000015d0910'
 where org_id = '00000000-0000-0000-0000-0000015d0a00';
insert into public.api_chaves (id, org_id, nome, escopo, permissoes) values
  ('00000000-0000-0000-0000-0000015d0901', '00000000-0000-0000-0000-0000015d0a00', 'Site', 'rent_a_car', '{reservas:write}');

-- Captur (e02): reserva do balcão até now()+4 dias exactos. Yaris (e06): motorista TVDE até +4 dias.
insert into public.reservas (org_id, viatura_id, data_inicio, data_fim) values
  ('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0e02', now() + interval '1 hour', now() + interval '4 days');
insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000015d0c01', '00000000-0000-0000-0000-0000015d0a00', 'Motorista TVDE Um');
insert into public.motorista_viaturas (org_id, motorista_id, viatura_id, data_inicio, data_fim, status) values
  ('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0c01', '00000000-0000-0000-0000-0000015d0e06',
   (now() - interval '30 days')::date, (now() + interval '4 days')::date, 'ativo');

-- hoje e d4 com a mesma aritmética das janelas de api_modelos_disponivel_desde (now() + k dias).
-- Período A: depois de a Captur ficar livre. Período B: enquanto está ocupada.
create temp table t as select
  (now() at time zone 'Europe/Lisbon')::date as hoje,
  ((now() + interval '4 days') at time zone 'Europe/Lisbon')::date as d4,
  now() + interval '5 days' as a_inicio, now() + interval '7 days' as a_fim,
  now() + interval '1 day' as b_inicio, now() + interval '3 days' as b_fim;
grant select on t to public;
create temp table m as select public.api_modelos('00000000-0000-0000-0000-0000015d0a00') as r;
grant select on m to public;
create temp table da as select public.api_disponibilidade('00000000-0000-0000-0000-0000015d0a00', (select a_inicio from t), (select a_fim from t),
  '00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0301') as r;
grant select on da to public;
create temp table db as select public.api_disponibilidade('00000000-0000-0000-0000-0000015d0a00', (select b_inicio from t), (select b_fim from t),
  '00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0301') as r;
grant select on db to public;

-- 1) levantamento até 15 dias
select is((public.api_disponibilidade('00000000-0000-0000-0000-0000015d0a00', now() + interval '16 days', now() + interval '18 days',
  '00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0301'))->'erro'->>'codigo', 'PERIODO_INVALIDO',
  'levantamento a +16 dias é recusado');
select is((public.api_disponibilidade('00000000-0000-0000-0000-0000015d0a00', now() + interval '16 days', now() + interval '18 days',
  '00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0301'))->'erro'->>'mensagem',
  'O levantamento tem de ser nos próximos 15 dias.', 'a mensagem explica o prazo');
select is((public.api_disponibilidade('00000000-0000-0000-0000-0000015d0a00', now() + interval '16 days', now() + interval '60 days',
  '00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0301'))->'erro'->>'codigo', 'PERIODO_INVALIDO',
  'o prazo dos 15 dias vem antes do máximo de 30 dias');
select ok((select r ? 'modelos' and not r ? 'erro' from (select public.api_disponibilidade('00000000-0000-0000-0000-0000015d0a00',
  now() + interval '14 days', now() + interval '16 days',
  '00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0301') as r) x),
  'levantamento a +14 dias é aceite');
select ok((select not r ? 'erro' from (select public.api_disponibilidade('00000000-0000-0000-0000-0000015d0a00',
  now() + interval '15 days', now() + interval '17 days',
  '00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0301') as r) x),
  'levantamento a 15 dias certos ainda é aceite');
select is((public.api_cotacao('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d01',
  now() + interval '16 days', now() + interval '18 days',
  '00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0301', '[]'::jsonb))->'erro'->>'codigo',
  'PERIODO_INVALIDO', 'a cotação também recusa +16 dias');
select is((public.api_criar_reserva('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0901',
  jsonb_build_object('modelo_id', '00000000-0000-0000-0000-0000015d0d01',
    'inicio', now() + interval '16 days', 'fim', now() + interval '18 days',
    'entrega', '00000000-0000-0000-0000-0000015d0301', 'recolha', '00000000-0000-0000-0000-0000015d0301',
    'extras', '[]'::jsonb, 'total_esperado', 70.00, 'referencia_externa', 'sodisp-1',
    'cliente', jsonb_build_object('nome', 'Carla Nova', 'email', 'carla@sodisp.pt', 'telefone', '+351912345678',
                                  'data_nascimento', '1990-05-01', 'pais', 'Portugal'),
    'carta_conducao', jsonb_build_object('numero', 'L-123', 'validade', '2030-01-01', 'pais', 'Portugal'))))->'erro'->>'codigo',
  'PERIODO_INVALIDO', 'criar reserva a +16 dias é recusado');
select is((select count(*)::int from public.reservas where org_id = '00000000-0000-0000-0000-0000015d0a00' and origem = 'site'), 0,
  'nada gravado');

-- 2) preço 0 € na tarifa do site não é publicável
select ok(not exists (select 1 from public.api_modelos_publicaveis('00000000-0000-0000-0000-0000015d0a00')
                       where modelo_id = '00000000-0000-0000-0000-0000015d0d03'), 'Megane a 0 € não é publicável');
select ok(not exists (select 1 from m, jsonb_array_elements(m.r) x where x->>'id' = '00000000-0000-0000-0000-0000015d0d03'),
  'Megane a 0 € não sai em api_modelos');
select ok(not exists (select 1 from da, jsonb_array_elements(da.r->'modelos') x where x->>'id' = '00000000-0000-0000-0000-0000015d0d03'),
  'Megane a 0 € não sai em api_disponibilidade, com viatura livre');
select is((public.api_cotacao('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d03',
  (select a_inicio from t), (select a_fim from t),
  '00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0301', '[]'::jsonb))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'cotação do Megane a 0 € → NAO_ENCONTRADO');
select is(public.api_modelo('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d03'), null,
  'detalhe do Megane a 0 € é null');

-- 3) Captur ocupada até +4 dias: aparece com a data em que fica livre
select is((select (x->>'disponivel_desde')::date from m, jsonb_array_elements(m.r) x
            where x->>'id' = '00000000-0000-0000-0000-0000015d0d02'), (select d4 from t),
  'Captur sai em api_modelos com disponivel_desde = dia em que a reserva acaba');
select is((select (x->>'disponivel_desde')::date from m, jsonb_array_elements(m.r) x
            where x->>'id' = '00000000-0000-0000-0000-0000015d0d01'), (select hoje from t),
  'Clio livre: disponivel_desde é hoje');
select ok(not exists (select 1 from db, jsonb_array_elements(db.r->'modelos') x where x->>'id' = '00000000-0000-0000-0000-0000015d0d02'),
  'Captur não sai na disponibilidade enquanto está ocupada');
select is((select x->>'quantidade_disponivel' from da, jsonb_array_elements(da.r->'modelos') x
            where x->>'id' = '00000000-0000-0000-0000-0000015d0d02'), '1',
  'Captur sai na disponibilidade depois do fim da reserva');
select is((public.api_cotacao('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d02',
  (select b_inicio from t), (select b_fim from t),
  '00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0301', '[]'::jsonb))->'erro'->>'codigo',
  'SEM_DISPONIBILIDADE', 'cotação da Captur enquanto ocupada → SEM_DISPONIBILIDADE');
select is((public.api_cotacao('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d02',
  (select a_inicio from t), (select a_fim from t),
  '00000000-0000-0000-0000-0000015d0301', '00000000-0000-0000-0000-0000015d0301', '[]'::jsonb))->'erro', null,
  'cotação da Captur depois do fim não dá erro');

-- 4) Kadjar inactiva: fora da lista, mas o detalhe responde com disponivel_desde null
select ok(not exists (select 1 from m, jsonb_array_elements(m.r) x where x->>'id' = '00000000-0000-0000-0000-0000015d0d04'),
  'Kadjar sem dia livre nos 15 não sai em api_modelos');
select ok(not exists (select 1 from public.api_modelos_disponivel_desde('00000000-0000-0000-0000-0000015d0a00')
                       where modelo_id = '00000000-0000-0000-0000-0000015d0d04'),
  'api_modelos_disponivel_desde não tem linha para o Kadjar');
select isnt(public.api_modelo('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d04'), null,
  'o detalhe do Kadjar continua a responder (um link do site não parte)');
select ok(public.api_modelo('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d04')->'disponivel_desde' = 'null'::jsonb,
  'detalhe do Kadjar com disponivel_desde null');
select is((public.api_modelo('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d02')->>'disponivel_desde')::date,
  (select d4 from t), 'detalhe da Captur leva a mesma disponivel_desde');

-- 5) TVDE: só o que está livre hoje, seja qual for o inicio pedido
select is((select array_agg((x->>'id')::uuid) from jsonb_array_elements(public.api_tvde_modelos('00000000-0000-0000-0000-0000015d0a00')) x),
  array['00000000-0000-0000-0000-0000015d0d05'::uuid],
  'api_tvde_modelos só traz o Corolla (Yaris ocupado, Auris a 0 €)');
select ok(not exists (select 1 from public.api_tvde_livres_hoje('00000000-0000-0000-0000-0000015d0a00')
                       where modelo_id = '00000000-0000-0000-0000-0000015d0d06'),
  'Yaris com motorista até +4 dias não está livre hoje');
select is((select quantidade from public.api_tvde_livres_hoje('00000000-0000-0000-0000-0000015d0a00')
            where modelo_id = '00000000-0000-0000-0000-0000015d0d05'), 1, 'Corolla: uma livre hoje');
-- Antes contava a partir de inicio e o Yaris aparecia a +10 dias; agora não.
select is((select array_agg((x->>'id')::uuid)
             from jsonb_array_elements(public.api_tvde_disponibilidade('00000000-0000-0000-0000-0000015d0a00',
                    now() + interval '10 days')->'modelos') x),
  array['00000000-0000-0000-0000-0000015d0d05'::uuid],
  'disponibilidade TVDE a +10 dias não traz o Yaris, que só fica livre a +5');
select is(public.api_tvde_disponibilidade('00000000-0000-0000-0000-0000015d0a00', now() + interval '10 days')->'modelos'->0->>'quantidade_disponivel',
  '1', 'Corolla com a quantidade livre hoje');
select is(public.api_tvde_modelo('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d06')->>'modelo', 'Yaris',
  'api_tvde_modelo devolve o Yaris ocupado (candidaturas continuam a validá-lo)');
select is(public.api_tvde_modelo('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d07'), null,
  'api_tvde_modelo do Auris a 0 € é null');
select ok(not exists (select 1 from public.api_tvde_modelos_publicaveis('00000000-0000-0000-0000-0000015d0a00')
                       where modelo_id = '00000000-0000-0000-0000-0000015d0d07'), 'Auris a 0 €/semana não é publicável');

-- 6) procura sem viatura nos 15 dias esgota o Clio: sai da lista, o detalhe fica sem data
insert into public.reservas (org_id, modelo_id, data_inicio, data_fim) values
  ('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d01', now() + interval '1 hour', now() + interval '20 days');
select ok(not exists (select 1 from jsonb_array_elements(public.api_modelos('00000000-0000-0000-0000-0000015d0a00')) x
                       where x->>'id' = '00000000-0000-0000-0000-0000015d0d01'),
  'Clio esgotado pela procura sem viatura sai de api_modelos');
select ok(public.api_modelo('00000000-0000-0000-0000-0000015d0a00', '00000000-0000-0000-0000-0000015d0d01')->'disponivel_desde' = 'null'::jsonb,
  'detalhe do Clio esgotado com disponivel_desde null');

-- 7) privilégios das funções novas: só service_role executa (uma linha TAP por função)
create temp table fns as select unnest(array[
  'public.api_modelos_cartoes(uuid,uuid,text)',
  'public.api_modelos_disponivel_desde(uuid)',
  'public.api_tvde_modelos_cartoes(uuid)',
  'public.api_tvde_livres_hoje(uuid)']) as f;
grant select on fns to public;
select ok(not has_function_privilege('anon', f, 'EXECUTE'), 'anon não executa ' || f) from fns;
select ok(not has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated não executa ' || f) from fns;
select ok(has_function_privilege('service_role', f, 'EXECUTE'), 'service_role executa ' || f) from fns;

select * from finish();
rollback;
