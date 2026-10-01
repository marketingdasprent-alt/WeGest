-- ============================================================
-- Catálogo da API externa — api_modelos_publicaveis, api_modelos, api_categorias…
-- ============================================================
-- Regras: modelo aparece se tem caixa e lugares, preço/dia na tarifa do site e
-- pelo menos uma viatura não-slot não vendida. Tipo vem de viatura_tipos.
-- ============================================================
begin;
select plan(18);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000c01ff', 'bootstrap@catalogo.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000c0a00', 'Org Cat A', 'cat-a'),
  ('00000000-0000-0000-0000-0000000c0b00', 'Org Cat B', 'cat-b');
insert into public.org_definicoes (org_id, iva_rent_a_car) values ('00000000-0000-0000-0000-0000000c0a00', 23)
  on conflict (org_id) do update set iva_rent_a_car = 23;

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000c0aa1', '00000000-0000-0000-0000-0000000c0a00', 'Renault'),
  ('00000000-0000-0000-0000-0000000c0ab1', '00000000-0000-0000-0000-0000000c0b00', 'Renault');
insert into public.viatura_modelos (id, org_id, marca_id, nome, caixa, lugares, portas, bagageira) values
  ('00000000-0000-0000-0000-0000000c0d01', '00000000-0000-0000-0000-0000000c0a00', '00000000-0000-0000-0000-0000000c0aa1', 'Clio', 'manual', 5, 5, 2),
  ('00000000-0000-0000-0000-0000000c0d02', '00000000-0000-0000-0000-0000000c0a00', '00000000-0000-0000-0000-0000000c0aa1', 'Kangoo', 'manual', 2, 4, 3),
  ('00000000-0000-0000-0000-0000000c0d03', '00000000-0000-0000-0000-0000000c0a00', '00000000-0000-0000-0000-0000000c0aa1', 'Megane', 'automatica', 5, 5, 3),
  ('00000000-0000-0000-0000-0000000c0db1', '00000000-0000-0000-0000-0000000c0b00', '00000000-0000-0000-0000-0000000c0ab1', 'Clio', 'manual', 5, 5, 2);
insert into public.renting_grupos (id, org_id, nome, codigo, ativo) values
  ('00000000-0000-0000-0000-0000000c0101', '00000000-0000-0000-0000-0000000c0a00', 'Citadino', 'CIT', true),
  ('00000000-0000-0000-0000-0000000c0102', '00000000-0000-0000-0000-0000000c0a00', 'Comercial Pequeno', 'COM', true),
  ('00000000-0000-0000-0000-0000000c01b1', '00000000-0000-0000-0000-0000000c0b00', 'Citadino', 'CIT', true);
insert into public.viatura_tipos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000c0201', '00000000-0000-0000-0000-0000000c0a00', 'COMERCIAL'),
  ('00000000-0000-0000-0000-0000000c0202', '00000000-0000-0000-0000-0000000c0a00', 'TVDE');
-- Clio: 2 viaturas (uma TVDE), Kangoo: 1 comercial, Megane: só slot, org B: 1 Clio
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, grupo_id, tipo_id, is_slot) values
  ('00000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000c0a00', 'CA-01-AA', '00000000-0000-0000-0000-0000000c0aa1', '00000000-0000-0000-0000-0000000c0d01', '00000000-0000-0000-0000-0000000c0101', '00000000-0000-0000-0000-0000000c0202', false),
  ('00000000-0000-0000-0000-0000000c0e02', '00000000-0000-0000-0000-0000000c0a00', 'CA-02-AA', '00000000-0000-0000-0000-0000000c0aa1', '00000000-0000-0000-0000-0000000c0d01', '00000000-0000-0000-0000-0000000c0101', null, false),
  ('00000000-0000-0000-0000-0000000c0e03', '00000000-0000-0000-0000-0000000c0a00', 'CA-03-AA', '00000000-0000-0000-0000-0000000c0aa1', '00000000-0000-0000-0000-0000000c0d02', '00000000-0000-0000-0000-0000000c0102', '00000000-0000-0000-0000-0000000c0201', false),
  ('00000000-0000-0000-0000-0000000c0e04', '00000000-0000-0000-0000-0000000c0a00', 'CA-04-AA', '00000000-0000-0000-0000-0000000c0aa1', '00000000-0000-0000-0000-0000000c0d03', '00000000-0000-0000-0000-0000000c0101', null, true),
  ('00000000-0000-0000-0000-0000000c0eb1', '00000000-0000-0000-0000-0000000c0b00', 'CB-01-AA', '00000000-0000-0000-0000-0000000c0ab1', '00000000-0000-0000-0000-0000000c0db1', '00000000-0000-0000-0000-0000000c01b1', null, false);
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site) values
  ('00000000-0000-0000-0000-0000000c0f01', '00000000-0000-0000-0000-0000000c0a00', 'Geral', 'renting', true, true),
  ('00000000-0000-0000-0000-0000000c0f02', '00000000-0000-0000-0000-0000000c0a00', 'Negociada', 'renting', true, false);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_dia, franquia_valor, caucao_valor, km_mensal) values
  ('00000000-0000-0000-0000-0000000c0a00', '00000000-0000-0000-0000-0000000c0f01', '00000000-0000-0000-0000-0000000c0d01', 35.00, 800, 300, 3000),
  ('00000000-0000-0000-0000-0000000c0a00', '00000000-0000-0000-0000-0000000c0f01', '00000000-0000-0000-0000-0000000c0d03', 50.00, 1000, 400, 3000),
  ('00000000-0000-0000-0000-0000000c0a00', '00000000-0000-0000-0000-0000000c0f02', '00000000-0000-0000-0000-0000000c0d02', 20.00, 500, 200, 3000);
insert into public.estacoes (id, org_id, nome, cidade, ativa, horario) values
  ('00000000-0000-0000-0000-0000000c0301', '00000000-0000-0000-0000-0000000c0a00', 'Leiria', 'Leiria', true, '09h-18h'),
  ('00000000-0000-0000-0000-0000000c0302', '00000000-0000-0000-0000-0000000c0a00', 'Fechada', 'Porto', false, null);
insert into public.renting_extras (id, org_id, nome, preco_unidade, tipo_calculo, ativo) values
  ('00000000-0000-0000-0000-0000000c0401', '00000000-0000-0000-0000-0000000c0a00', 'Cadeira bebé', 5, 'dia', true);
insert into public.renting_coberturas (id, org_id, nome, preco_dia, franquia_valor, ativa) values
  ('00000000-0000-0000-0000-0000000c0c01', '00000000-0000-0000-0000-0000000c0a00', 'Premium', 12, 0, true);

-- preço
select is(public.api_preco_json(35.00, 23), '{"sem_iva": 35.00, "com_iva": 43.05, "iva": 23}'::jsonb, 'preço sem e com IVA');
select is(public.api_preco_json(null, 23), null, 'sem valor dá null');
-- 23::numeric: is(anyelement, anyelement) exige o mesmo tipo dos dois lados.
select is(public.api_iva_rent_a_car('00000000-0000-0000-0000-0000000c0a00'), 23::numeric, 'IVA da org');

-- publicáveis: só o Clio (Kangoo não tem preço na tarifa do site; Megane só tem slot)
select is((select count(*)::int from public.api_modelos_publicaveis('00000000-0000-0000-0000-0000000c0a00')), 1, 'só um modelo publicável');
select is((select modelo from public.api_modelos_publicaveis('00000000-0000-0000-0000-0000000c0a00')), 'Clio', 'o publicável é o Clio');
select is((select frota from public.api_modelos_publicaveis('00000000-0000-0000-0000-0000000c0a00')), 2, 'frota conta as 2 viaturas não-slot');
select is((select tipo from public.api_modelos_publicaveis('00000000-0000-0000-0000-0000000c0a00')), 'passageiros', 'TVDE conta como passageiros');
select is((select preco_dia from public.api_modelos_publicaveis('00000000-0000-0000-0000-0000000c0a00')), 35.00, 'preço da tarifa do site');

-- org B nunca aparece em A
select is((select count(*)::int from public.api_modelos('00000000-0000-0000-0000-0000000c0a00') m where m->>'modelo' = 'Clio' and m->>'id' = '00000000-0000-0000-0000-0000000c0db1'), 0, 'modelo da org B não sai na org A');

-- jsonb dos endpoints
select is(jsonb_array_length(public.api_modelos('00000000-0000-0000-0000-0000000c0a00')), 1, 'api_modelos devolve 1');
select is(public.api_modelos('00000000-0000-0000-0000-0000000c0a00')->0->'preco_dia'->>'com_iva', '43.05', 'preço com IVA no cartão');
select is(jsonb_array_length(public.api_modelos('00000000-0000-0000-0000-0000000c0a00', null, 'comercial')), 0, 'filtro por tipo comercial dá 0');
select is(jsonb_array_length(public.api_categorias('00000000-0000-0000-0000-0000000c0a00')), 1, 'só categorias com modelos publicáveis');
select is(public.api_categorias('00000000-0000-0000-0000-0000000c0a00')->0->>'modelos', '1', 'categoria conta os modelos');
select is(jsonb_array_length(public.api_localizacoes('00000000-0000-0000-0000-0000000c0a00')), 1, 'só estações activas');
select is(public.api_modelo('00000000-0000-0000-0000-0000000c0a00', '00000000-0000-0000-0000-0000000c0d01')->'tarifa'->'caucao'->>'sem_iva', '300.00', 'detalhe traz a caução');

-- org sem tarifa_site: lista vazia, nunca erro
select is(jsonb_array_length(public.api_modelos('00000000-0000-0000-0000-0000000c0b00')), 0, 'org sem tarifa_site dá lista vazia');

-- só o service_role (a edge function) executa as funções api_*
select ok(
  not has_function_privilege('authenticated', 'public.api_modelos(uuid,uuid,text)', 'EXECUTE'),
  'authenticated não executa api_modelos');

select * from finish();
rollback;
