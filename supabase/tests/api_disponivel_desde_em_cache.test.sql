-- ============================================================
-- "Disponível desde" em cache (20261020170000)
-- ============================================================
-- O cron guarda o cálculo por organização; api_modelos_disponivel_desde lê a
-- cache fresca e, sem ela, calcula na hora como antes. Fixture ao padrão de
-- api_so_disponiveis.test.sql; datas relativas a now().
-- ============================================================
begin;
select plan(17);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000ddc01ff', 'bootstrap@ddcache.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000ddc0a00', 'Org DdCache A', 'ddcache-a'),
  ('00000000-0000-0000-0000-00000ddc0b00', 'Org DdCache B', 'ddcache-b');
insert into public.org_definicoes (org_id, iva_rent_a_car, iva_tvde) values ('00000000-0000-0000-0000-00000ddc0a00', 23, 6)
  on conflict (org_id) do update set iva_rent_a_car = 23, iva_tvde = 6;

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000ddc0aa1', '00000000-0000-0000-0000-00000ddc0a00', 'Renault');
-- d01 Clio livre; d02 Captur ocupada até +4 dias.
insert into public.viatura_modelos (id, org_id, marca_id, nome, caixa, lugares, portas, bagageira) values
  ('00000000-0000-0000-0000-00000ddc0d01', '00000000-0000-0000-0000-00000ddc0a00', '00000000-0000-0000-0000-00000ddc0aa1', 'Clio', 'manual', 5, 5, 2),
  ('00000000-0000-0000-0000-00000ddc0d02', '00000000-0000-0000-0000-00000ddc0a00', '00000000-0000-0000-0000-00000ddc0aa1', 'Captur', 'automatica', 5, 5, 3);
insert into public.renting_grupos (id, org_id, nome, codigo, ativo) values
  ('00000000-0000-0000-0000-00000ddc0101', '00000000-0000-0000-0000-00000ddc0a00', 'Citadino', 'CIT', true);
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, grupo_id, is_slot, status) values
  ('00000000-0000-0000-0000-00000ddc0e01', '00000000-0000-0000-0000-00000ddc0a00', 'DC-01-AA', '00000000-0000-0000-0000-00000ddc0aa1', '00000000-0000-0000-0000-00000ddc0d01', '00000000-0000-0000-0000-00000ddc0101', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000ddc0e02', '00000000-0000-0000-0000-00000ddc0a00', 'DC-02-AA', '00000000-0000-0000-0000-00000ddc0aa1', '00000000-0000-0000-0000-00000ddc0d02', '00000000-0000-0000-0000-00000ddc0101', false, 'disponivel');
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site) values
  ('00000000-0000-0000-0000-00000ddc0f01', '00000000-0000-0000-0000-00000ddc0a00', 'Geral', 'renting', true, true);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_dia, franquia_valor, caucao_valor, km_mensal) values
  ('00000000-0000-0000-0000-00000ddc0a00', '00000000-0000-0000-0000-00000ddc0f01', '00000000-0000-0000-0000-00000ddc0d01', 35.00, 800, 300, 3000),
  ('00000000-0000-0000-0000-00000ddc0a00', '00000000-0000-0000-0000-00000ddc0f01', '00000000-0000-0000-0000-00000ddc0d02', 50.00, 1000, 400, 3000);
-- Só a org A tem chave activa: a B não entra no cron.
insert into public.api_chaves (id, org_id, nome, escopo, permissoes) values
  ('00000000-0000-0000-0000-00000ddc0901', '00000000-0000-0000-0000-00000ddc0a00', 'Site', 'rent_a_car', '{reservas:write}');
insert into public.reservas (org_id, viatura_id, data_inicio, data_fim) values
  ('00000000-0000-0000-0000-00000ddc0a00', '00000000-0000-0000-0000-00000ddc0e02', now() + interval '1 hour', now() + interval '4 days');

create temp table t as select
  (now() at time zone 'Europe/Lisbon')::date as hoje,
  ((now() + interval '4 days') at time zone 'Europe/Lisbon')::date as d4;
grant select on t to public;

-- 1) sem cache: calcula na hora, igual ao cálculo directo
select is((select count(*)::int from public.api_disponivel_desde_cache
            where org_id = '00000000-0000-0000-0000-00000ddc0a00'), 0, 'antes do cron não há cache');
select set_eq(
  $$ select * from public.api_modelos_disponivel_desde('00000000-0000-0000-0000-00000ddc0a00') $$,
  $$ select * from public.api_modelos_disponivel_desde_calcular('00000000-0000-0000-0000-00000ddc0a00') $$,
  'sem cache devolve o cálculo na hora');
select is((select disponivel_desde from public.api_modelos_disponivel_desde('00000000-0000-0000-0000-00000ddc0a00')
            where modelo_id = '00000000-0000-0000-0000-00000ddc0d02'), (select d4 from t),
  'Captur livre a partir do fim da reserva');

-- 2) o cron enche a cache só das orgs com chave activa
do $$ begin perform public.api_refrescar_disponivel_desde(); end $$;
select is((select count(*)::int from public.api_disponivel_desde_cache
            where org_id = '00000000-0000-0000-0000-00000ddc0a00'), 1, 'org A com cache');
select is((select count(*)::int from public.api_disponivel_desde_cache
            where org_id = '00000000-0000-0000-0000-00000ddc0b00'), 0, 'org B sem chave fica de fora');
select set_eq(
  $$ select (e->>'modelo_id')::uuid, (e->>'disponivel_desde')::date
       from public.api_disponivel_desde_cache c, jsonb_array_elements(c.modelos) e
      where c.org_id = '00000000-0000-0000-0000-00000ddc0a00' $$,
  $$ select * from public.api_modelos_disponivel_desde_calcular('00000000-0000-0000-0000-00000ddc0a00') $$,
  'a cache guarda o mesmo que o cálculo');

-- 3) com cache fresca lê a cache: procura nova ainda não aparece
insert into public.reservas (org_id, modelo_id, data_inicio, data_fim) values
  ('00000000-0000-0000-0000-00000ddc0a00', '00000000-0000-0000-0000-00000ddc0d01', now() + interval '1 hour', now() + interval '20 days');
select ok(not exists (select 1 from public.api_modelos_disponivel_desde_calcular('00000000-0000-0000-0000-00000ddc0a00')
                       where modelo_id = '00000000-0000-0000-0000-00000ddc0d01'),
  'o cálculo directo já vê o Clio esgotado');
select is((select disponivel_desde from public.api_modelos_disponivel_desde('00000000-0000-0000-0000-00000ddc0a00')
            where modelo_id = '00000000-0000-0000-0000-00000ddc0d01'), (select hoje from t),
  'a leitura usa a cache e ainda mostra o Clio');
select ok(exists (select 1 from jsonb_array_elements(public.api_modelos('00000000-0000-0000-0000-00000ddc0a00')) x
                   where x->>'id' = '00000000-0000-0000-0000-00000ddc0d01'),
  'api_modelos também lê a cache');

-- 4) a volta seguinte do cron apanha a procura nova
do $$ begin perform public.api_refrescar_disponivel_desde(); end $$;
select ok(not exists (select 1 from public.api_modelos_disponivel_desde('00000000-0000-0000-0000-00000ddc0a00')
                       where modelo_id = '00000000-0000-0000-0000-00000ddc0d01'),
  'depois do refresh o Clio sai');
select ok(public.api_modelo('00000000-0000-0000-0000-00000ddc0a00', '00000000-0000-0000-0000-00000ddc0d01')->'disponivel_desde' = 'null'::jsonb,
  'detalhe do Clio esgotado com disponivel_desde null');

-- 5) cache velha (> 20 min) é ignorada
update public.api_disponivel_desde_cache
   set modelos = jsonb_build_array(jsonb_build_object('modelo_id', '00000000-0000-0000-0000-00000ddc0d01', 'disponivel_desde', (select hoje from t))),
       calculado_em = now() - interval '1 hour'
 where org_id = '00000000-0000-0000-0000-00000ddc0a00';
select set_eq(
  $$ select * from public.api_modelos_disponivel_desde('00000000-0000-0000-0000-00000ddc0a00') $$,
  $$ select * from public.api_modelos_disponivel_desde_calcular('00000000-0000-0000-0000-00000ddc0a00') $$,
  'cache velha: volta a calcular na hora');

-- 6) uma data guardada antes da meia-noite nunca sai antes de hoje
update public.api_disponivel_desde_cache
   set modelos = jsonb_build_array(jsonb_build_object('modelo_id', '00000000-0000-0000-0000-00000ddc0d02', 'disponivel_desde', (select hoje - 1 from t))),
       calculado_em = now()
 where org_id = '00000000-0000-0000-0000-00000ddc0a00';
select is((select disponivel_desde from public.api_modelos_disponivel_desde('00000000-0000-0000-0000-00000ddc0a00')
            where modelo_id = '00000000-0000-0000-0000-00000ddc0d02'), (select hoje from t),
  'data de ontem na cache sai como hoje');

-- 7) privilégios e cron
select ok(not has_table_privilege('authenticated', 'public.api_disponivel_desde_cache', 'SELECT'),
  'authenticated não lê a cache');
select ok(not has_function_privilege('authenticated', 'public.api_modelos_disponivel_desde_calcular(uuid)', 'EXECUTE'),
  'authenticated não executa o cálculo');
select ok(not has_function_privilege('service_role', 'public.api_refrescar_disponivel_desde()', 'EXECUTE'),
  'só o dono (cron) executa o refresh');
select is((select schedule from cron.job where jobname = 'api_disponivel_desde_cache'), '*/10 * * * *',
  'cron de 10 em 10 min');

select * from finish();
rollback;
