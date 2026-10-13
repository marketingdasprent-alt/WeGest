-- ============================================================
-- API do site: a foto do modelo é a capa de uma viatura desse modelo
-- ============================================================
-- api_foto_modelo escolhe a capa mais recente de uma viatura da org, não
-- vendida e não slot; os cartões levam foto_path e imagem_url a null (a edge
-- assina e preenche). Fixture ao padrão de api_tvde_catalogo.test.sql.
-- created_at explícitos: dentro da transacção now() é sempre o mesmo.
-- ============================================================
begin;
select plan(36);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000f0701ff', 'bootstrap@fotoviatura.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000f070a00', 'Org Foto A', 'fotoviat-a'),
  ('00000000-0000-0000-0000-00000f070b00', 'Org Foto B', 'fotoviat-b');
insert into public.org_definicoes (org_id, iva_rent_a_car, iva_tvde) values ('00000000-0000-0000-0000-00000f070a00', 23, 6)
  on conflict (org_id) do update set iva_rent_a_car = 23, iva_tvde = 6;

insert into public.viatura_tipos (id, org_id, nome, elegivel_tvde) values
  ('00000000-0000-0000-0000-00000f070701', '00000000-0000-0000-0000-00000f070a00', 'PASSAGEIROS', true),
  ('00000000-0000-0000-0000-00000f0707b1', '00000000-0000-0000-0000-00000f070b00', 'PASSAGEIROS', true);
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000f070aa1', '00000000-0000-0000-0000-00000f070a00', 'Toyota'),
  ('00000000-0000-0000-0000-00000f070ab1', '00000000-0000-0000-0000-00000f070b00', 'Toyota');
-- A foto de marketing do modelo fica preenchida para provar que a API a ignora.
insert into public.viatura_modelos (id, org_id, marca_id, nome, caixa, lugares, portas, bagageira, imagem_url) values
  ('00000000-0000-0000-0000-00000f070d01', '00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070aa1', 'Corolla', 'automatica', 5, 5, 3, 'https://marketing.exemplo/corolla.webp'),
  ('00000000-0000-0000-0000-00000f070d02', '00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070aa1', 'Yaris', 'automatica', 5, 5, 2, 'https://marketing.exemplo/yaris.webp'),
  ('00000000-0000-0000-0000-00000f070db1', '00000000-0000-0000-0000-00000f070b00', '00000000-0000-0000-0000-00000f070ab1', 'Corolla', 'automatica', 5, 5, 3, null);
insert into public.renting_grupos (id, org_id, nome, codigo, ativo, imagem_url) values
  ('00000000-0000-0000-0000-00000f070101', '00000000-0000-0000-0000-00000f070a00', 'Berlina', 'BER', true, 'https://marketing.exemplo/berlina.webp');
-- Corolla da A: e01 e e02 contam, e03 vendida, e05 slot. Yaris e04 sem foto.
-- Org B: eb1 do seu Corolla e eb2 a apontar para o Corolla da A.
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, grupo_id, tipo_id, is_slot, is_vendida) values
  ('00000000-0000-0000-0000-00000f070e01', '00000000-0000-0000-0000-00000f070a00', 'FA-01-AA', '00000000-0000-0000-0000-00000f070aa1', '00000000-0000-0000-0000-00000f070d01', '00000000-0000-0000-0000-00000f070101', '00000000-0000-0000-0000-00000f070701', false, false),
  ('00000000-0000-0000-0000-00000f070e02', '00000000-0000-0000-0000-00000f070a00', 'FA-02-AA', '00000000-0000-0000-0000-00000f070aa1', '00000000-0000-0000-0000-00000f070d01', '00000000-0000-0000-0000-00000f070101', '00000000-0000-0000-0000-00000f070701', false, false),
  ('00000000-0000-0000-0000-00000f070e03', '00000000-0000-0000-0000-00000f070a00', 'FA-03-AA', '00000000-0000-0000-0000-00000f070aa1', '00000000-0000-0000-0000-00000f070d01', '00000000-0000-0000-0000-00000f070101', '00000000-0000-0000-0000-00000f070701', false, true),
  ('00000000-0000-0000-0000-00000f070e04', '00000000-0000-0000-0000-00000f070a00', 'FA-04-AA', '00000000-0000-0000-0000-00000f070aa1', '00000000-0000-0000-0000-00000f070d02', '00000000-0000-0000-0000-00000f070101', '00000000-0000-0000-0000-00000f070701', false, false),
  ('00000000-0000-0000-0000-00000f070e05', '00000000-0000-0000-0000-00000f070a00', 'FA-05-AA', '00000000-0000-0000-0000-00000f070aa1', '00000000-0000-0000-0000-00000f070d01', '00000000-0000-0000-0000-00000f070101', '00000000-0000-0000-0000-00000f070701', true, false),
  ('00000000-0000-0000-0000-00000f070eb1', '00000000-0000-0000-0000-00000f070b00', 'FB-01-AA', '00000000-0000-0000-0000-00000f070ab1', '00000000-0000-0000-0000-00000f070db1', null, '00000000-0000-0000-0000-00000f0707b1', false, false),
  ('00000000-0000-0000-0000-00000f070eb2', '00000000-0000-0000-0000-00000f070b00', 'FB-02-AA', '00000000-0000-0000-0000-00000f070ab1', '00000000-0000-0000-0000-00000f070d01', null, '00000000-0000-0000-0000-00000f0707b1', false, false);

-- e01: capa antiga e uma segunda foto mais recente (não é capa, não conta).
-- e02: capa mais recente que a de e01. e03, e05 e eb2: ainda mais recentes, todas fora.
insert into public.viatura_documentos (id, org_id, viatura_id, tipo_documento, ficheiro_url, ordem, created_at) values
  ('00000000-0000-0000-0000-00000f070f01', '00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070e01', 'foto', '00000000-0000-0000-0000-00000f070e01/fotos/capa', 0, '2026-01-01T10:00:00Z'),
  ('00000000-0000-0000-0000-00000f070f02', '00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070e01', 'foto', '00000000-0000-0000-0000-00000f070e01/fotos/segunda', 1, '2026-09-01T10:00:00Z'),
  ('00000000-0000-0000-0000-00000f070f03', '00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070e02', 'foto', '00000000-0000-0000-0000-00000f070e02/fotos/capa', 0, '2026-06-01T10:00:00Z'),
  ('00000000-0000-0000-0000-00000f070f04', '00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070e03', 'foto', '00000000-0000-0000-0000-00000f070e03/fotos/vendida', 0, '2026-10-01T10:00:00Z'),
  ('00000000-0000-0000-0000-00000f070f05', '00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070e05', 'foto', '00000000-0000-0000-0000-00000f070e05/fotos/slot', 0, '2026-10-02T10:00:00Z'),
  ('00000000-0000-0000-0000-00000f070fb1', '00000000-0000-0000-0000-00000f070b00', '00000000-0000-0000-0000-00000f070eb1', 'foto', '00000000-0000-0000-0000-00000f070eb1/fotos/capa', 0, '2026-05-01T10:00:00Z'),
  ('00000000-0000-0000-0000-00000f070fb2', '00000000-0000-0000-0000-00000f070b00', '00000000-0000-0000-0000-00000f070eb2', 'foto', '00000000-0000-0000-0000-00000f070eb2/fotos/outra-org', 0, '2026-10-03T10:00:00Z');
-- Um documento que não é foto nunca é capa.
insert into public.viatura_documentos (org_id, viatura_id, tipo_documento, ficheiro_url, created_at) values
  ('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070e04', 'dua', 'e04/documentos/dua.pdf', '2026-10-04T10:00:00Z');

insert into public.estacoes (id, org_id, nome, cidade, ativa) values
  ('00000000-0000-0000-0000-00000f070301', '00000000-0000-0000-0000-00000f070a00', 'Leiria', 'Leiria', true);
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site) values
  ('00000000-0000-0000-0000-00000f070c01', '00000000-0000-0000-0000-00000f070a00', 'Geral', 'renting', true, true),
  ('00000000-0000-0000-0000-00000f070c02', '00000000-0000-0000-0000-00000f070a00', 'TVDE Site', 'tvde', true, true);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_dia, preco_semana, franquia_valor, caucao_valor, km_mensal) values
  ('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070c01', '00000000-0000-0000-0000-00000f070d01', 40.00, null, 800, 300, 3000),
  ('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070c01', '00000000-0000-0000-0000-00000f070d02', 30.00, null, 800, 300, 3000),
  ('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070c02', '00000000-0000-0000-0000-00000f070d01', null, 250.00, 1000, 500, 6000),
  ('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070c02', '00000000-0000-0000-0000-00000f070d02', null, 200.00, 1000, 500, 6000);

create temp table p as select
  ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '2 days 10 hours') at time zone 'Europe/Lisbon') as inicio;
grant select on p to public;

-- 1) escolha da foto
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070d01'),
  '00000000-0000-0000-0000-00000f070e02/fotos/capa', 'Corolla: a capa mais recente das viaturas que contam');
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070d02'),
  null, 'Yaris sem foto: null (o DUA não conta)');
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070b00', '00000000-0000-0000-0000-00000f070db1'),
  '00000000-0000-0000-0000-00000f070eb1/fotos/capa', 'org B obtém a capa do seu Corolla');
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070db1'),
  null, 'org A não obtém a foto do modelo da org B');
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070a00', null), null, 'modelo nulo: null');

-- 2) cartões de rent-a-car
create temp table rac as select public.api_modelos('00000000-0000-0000-0000-00000f070a00') as r;
grant select on rac to public;
select is((select x->>'foto_path' from rac, jsonb_array_elements(rac.r) x where x->>'modelo' = 'Corolla'),
  '00000000-0000-0000-0000-00000f070e02/fotos/capa', 'api_modelos: Corolla leva foto_path da viatura');
select ok((select x->'imagem_url' = 'null'::jsonb from rac, jsonb_array_elements(rac.r) x where x->>'modelo' = 'Corolla'),
  'api_modelos: imagem_url sai null, nunca a foto de marketing');
select ok((select x->'foto_path' = 'null'::jsonb from rac, jsonb_array_elements(rac.r) x where x->>'modelo' = 'Yaris'),
  'api_modelos: Yaris sem foto leva foto_path null');
select ok(not exists (select 1 from rac, jsonb_array_elements(rac.r) x where x::text like '%marketing.exemplo%'),
  'api_modelos: nenhum cartão traz a foto de marketing');
select is(public.api_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070d01')->>'foto_path',
  '00000000-0000-0000-0000-00000f070e02/fotos/capa', 'api_modelo herda o foto_path');
select is((select x->>'foto_path'
             from jsonb_array_elements(public.api_disponibilidade('00000000-0000-0000-0000-00000f070a00',
                    (select inicio from p), (select inicio from p) + interval '3 days',
                    '00000000-0000-0000-0000-00000f070301', '00000000-0000-0000-0000-00000f070301')->'modelos') x
            where x->>'modelo' = 'Corolla'),
  '00000000-0000-0000-0000-00000f070e02/fotos/capa', 'api_disponibilidade herda o foto_path');

-- 3) cartões TVDE
create temp table tv as select public.api_tvde_modelos('00000000-0000-0000-0000-00000f070a00') as r;
grant select on tv to public;
select is((select x->>'foto_path' from tv, jsonb_array_elements(tv.r) x where x->>'modelo' = 'Corolla'),
  '00000000-0000-0000-0000-00000f070e02/fotos/capa', 'api_tvde_modelos: Corolla leva foto_path da viatura');
select ok((select x->'imagem_url' = 'null'::jsonb from tv, jsonb_array_elements(tv.r) x where x->>'modelo' = 'Corolla'),
  'api_tvde_modelos: imagem_url sai null');
select ok((select x->'foto_path' = 'null'::jsonb from tv, jsonb_array_elements(tv.r) x where x->>'modelo' = 'Yaris'),
  'api_tvde_modelos: Yaris sem foto leva foto_path null');
select is(public.api_tvde_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070d01')->>'foto_path',
  '00000000-0000-0000-0000-00000f070e02/fotos/capa', 'api_tvde_modelo herda o foto_path');
select is((select x->>'foto_path'
             from jsonb_array_elements(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000f070a00',
                    (select inicio from p))->'modelos') x
            where x->>'modelo' = 'Corolla'),
  '00000000-0000-0000-0000-00000f070e02/fotos/capa', 'api_tvde_disponibilidade herda o foto_path');

-- 4) categorias não mudam
select is((select x->>'imagem_url' from jsonb_array_elements(public.api_categorias('00000000-0000-0000-0000-00000f070a00')) x),
  'https://marketing.exemplo/berlina.webp', 'api_categorias continua com a imagem da categoria');

-- 5) ficheiro_url é texto do cliente: só passa um caminho da própria viatura e da org.
-- Capa forçada (ordem -5) no Yaris e04, que não tinha foto.
insert into public.viatura_documentos (id, org_id, viatura_id, tipo_documento, ficheiro_url, ordem, created_at) values
  ('00000000-0000-0000-0000-00000f070f07', '00000000-0000-0000-0000-00000f070b00', '00000000-0000-0000-0000-00000f070e04', 'foto', '00000000-0000-0000-0000-00000f070e04/fotos/da-org-b', -5, '2026-06-01T10:00:00Z');
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070d02'),
  null, 'foto com org_id da B numa viatura da A não é assinada');
update public.viatura_documentos set org_id = '00000000-0000-0000-0000-00000f070a00',
       ficheiro_url = '00000000-0000-0000-0000-00000f070e02/fotos/capa'
 where id = '00000000-0000-0000-0000-00000f070f07';
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070d02'),
  null, 'caminho fora de <viatura_id>/fotos/ não é assinado');
update public.viatura_documentos set ficheiro_url = '00000000-0000-0000-0000-00000f070e04/fotos/../../outra/dua.pdf'
 where id = '00000000-0000-0000-0000-00000f070f07';
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070d02'),
  null, 'caminho com .. não é assinado');
update public.viatura_documentos set ficheiro_url = '00000000-0000-0000-0000-00000f070e04/fotos/boa'
 where id = '00000000-0000-0000-0000-00000f070f07';
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070d02'),
  '00000000-0000-0000-0000-00000f070e04/fotos/boa', 'a mesma capa com caminho e org certos já passa');

-- 6) a escolha acompanha a frota
-- Capas com a mesma data: desempata a matrícula (FA-01-AA antes de FA-02-AA).
update public.viatura_documentos set created_at = '2026-06-01T10:00:00Z' where id = '00000000-0000-0000-0000-00000f070f01';
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070d01'),
  '00000000-0000-0000-0000-00000f070e01/fotos/capa', 'mesma data: desempata a matrícula');
-- e01 vendida: fica a e02.
update public.viaturas set is_vendida = true where id = '00000000-0000-0000-0000-00000f070e01';
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070d01'),
  '00000000-0000-0000-0000-00000f070e02/fotos/capa', 'viatura vendida sai da escolha');
-- Reordenar a e02 promove outra capa: a foto escolhida é sempre a capa.
insert into public.viatura_documentos (id, org_id, viatura_id, tipo_documento, ficheiro_url, ordem, created_at) values
  ('00000000-0000-0000-0000-00000f070f06', '00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070e02', 'foto', '00000000-0000-0000-0000-00000f070e02/fotos/nova-capa', -1, '2026-06-02T10:00:00Z');
select is(public.api_foto_modelo('00000000-0000-0000-0000-00000f070a00', '00000000-0000-0000-0000-00000f070d01'),
  '00000000-0000-0000-0000-00000f070e02/fotos/nova-capa', 'a capa nova da viatura passa a ser a foto do modelo');

-- 7) privilégios: só service_role executa
create temp table fns as select unnest(array[
  'public.api_foto_modelo(uuid,uuid)',
  'public.api_modelos(uuid,uuid,text)',
  'public.api_tvde_modelos(uuid)',
  'public.api_modelo(uuid,uuid)']) as f;
grant select on fns to public;
select ok(not has_function_privilege('anon', f, 'EXECUTE'), 'anon não executa ' || f) from fns;
select ok(not has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated não executa ' || f) from fns;
select ok(has_function_privilege('service_role', f, 'EXECUTE'), 'service_role executa ' || f) from fns;

select * from finish();
rollback;
