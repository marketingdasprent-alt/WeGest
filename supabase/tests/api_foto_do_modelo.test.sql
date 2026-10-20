-- ============================================================
-- API do site: a foto do modelo é a carregada na aba Modelos
-- ============================================================
-- imagem_url dos cartões vem de viatura_modelos.imagem_url, só se for do
-- bucket modelos-viaturas na pasta da própria org. As capas das viaturas
-- nunca saem, nem como recurso. Fixture ao padrão de api_tvde_catalogo.test.sql.
-- ============================================================
begin;
select plan(37);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000f0801ff', 'bootstrap@fotomodelo.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000f080a00', 'Org Foto A', 'fotomod-a'),
  ('00000000-0000-0000-0000-00000f080b00', 'Org Foto B', 'fotomod-b');
insert into public.org_definicoes (org_id, iva_rent_a_car, iva_tvde) values ('00000000-0000-0000-0000-00000f080a00', 23, 6)
  on conflict (org_id) do update set iva_rent_a_car = 23, iva_tvde = 6;

insert into public.viatura_tipos (id, org_id, nome, elegivel_tvde) values
  ('00000000-0000-0000-0000-00000f080701', '00000000-0000-0000-0000-00000f080a00', 'PASSAGEIROS', true);
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000f080aa1', '00000000-0000-0000-0000-00000f080a00', 'Toyota');
-- Corolla com foto do bucket; Yaris com um URL de fora, que nunca sai.
insert into public.viatura_modelos (id, org_id, marca_id, nome, caixa, lugares, portas, bagageira, imagem_url) values
  ('00000000-0000-0000-0000-00000f080d01', '00000000-0000-0000-0000-00000f080a00', '00000000-0000-0000-0000-00000f080aa1', 'Corolla', 'automatica', 5, 5, 3,
   'https://proj.supabase.co/storage/v1/object/public/modelos-viaturas/00000000-0000-0000-0000-00000f080a00/00000000-0000-0000-0000-00000f080d01.webp?v=1760000000000'),
  ('00000000-0000-0000-0000-00000f080d02', '00000000-0000-0000-0000-00000f080a00', '00000000-0000-0000-0000-00000f080aa1', 'Yaris', 'automatica', 5, 5, 2,
   'https://marketing.exemplo/yaris.webp');
insert into public.renting_grupos (id, org_id, nome, codigo, ativo, imagem_url) values
  ('00000000-0000-0000-0000-00000f080101', '00000000-0000-0000-0000-00000f080a00', 'Berlina', 'BER', true, 'https://marketing.exemplo/berlina.webp');
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, grupo_id, tipo_id, is_slot, is_vendida) values
  ('00000000-0000-0000-0000-00000f080e01', '00000000-0000-0000-0000-00000f080a00', 'FM-01-AA', '00000000-0000-0000-0000-00000f080aa1', '00000000-0000-0000-0000-00000f080d01', '00000000-0000-0000-0000-00000f080101', '00000000-0000-0000-0000-00000f080701', false, false),
  ('00000000-0000-0000-0000-00000f080e02', '00000000-0000-0000-0000-00000f080a00', 'FM-02-AA', '00000000-0000-0000-0000-00000f080aa1', '00000000-0000-0000-0000-00000f080d02', '00000000-0000-0000-0000-00000f080101', '00000000-0000-0000-0000-00000f080701', false, false);
-- As duas viaturas têm capa: nenhuma pode chegar ao site.
insert into public.viatura_documentos (org_id, viatura_id, tipo_documento, ficheiro_url, ordem) values
  ('00000000-0000-0000-0000-00000f080a00', '00000000-0000-0000-0000-00000f080e01', 'foto', '00000000-0000-0000-0000-00000f080e01/fotos/capa', 0),
  ('00000000-0000-0000-0000-00000f080a00', '00000000-0000-0000-0000-00000f080e02', 'foto', '00000000-0000-0000-0000-00000f080e02/fotos/capa', 0);

insert into public.estacoes (id, org_id, nome, cidade, ativa) values
  ('00000000-0000-0000-0000-00000f080301', '00000000-0000-0000-0000-00000f080a00', 'Leiria', 'Leiria', true);
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site) values
  ('00000000-0000-0000-0000-00000f080c01', '00000000-0000-0000-0000-00000f080a00', 'Geral', 'renting', true, true),
  ('00000000-0000-0000-0000-00000f080c02', '00000000-0000-0000-0000-00000f080a00', 'TVDE Site', 'tvde', true, true);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_dia, preco_semana, franquia_valor, caucao_valor, km_mensal) values
  ('00000000-0000-0000-0000-00000f080a00', '00000000-0000-0000-0000-00000f080c01', '00000000-0000-0000-0000-00000f080d01', 40.00, null, 800, 300, 3000),
  ('00000000-0000-0000-0000-00000f080a00', '00000000-0000-0000-0000-00000f080c01', '00000000-0000-0000-0000-00000f080d02', 30.00, null, 800, 300, 3000),
  ('00000000-0000-0000-0000-00000f080a00', '00000000-0000-0000-0000-00000f080c02', '00000000-0000-0000-0000-00000f080d01', null, 250.00, 1000, 500, 6000),
  ('00000000-0000-0000-0000-00000f080a00', '00000000-0000-0000-0000-00000f080c02', '00000000-0000-0000-0000-00000f080d02', null, 200.00, 1000, 500, 6000);

create temp table p as select
  ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '2 days 10 hours') at time zone 'Europe/Lisbon') as inicio,
  'https://proj.supabase.co/storage/v1/object/public/modelos-viaturas/00000000-0000-0000-0000-00000f080a00/00000000-0000-0000-0000-00000f080d01.webp?v=1760000000000'::text as foto;
grant select on p to public;

-- 1) só passa uma foto do bucket, na pasta da org
select is(public.api_imagem_modelo('00000000-0000-0000-0000-00000f080a00', (select foto from p)),
  (select foto from p), 'foto do bucket na pasta da org, com ?v=, passa');
select is(public.api_imagem_modelo('00000000-0000-0000-0000-00000f080a00',
  'https://proj.supabase.co/storage/v1/object/public/modelos-viaturas/00000000-0000-0000-0000-00000f080a00/m.png'),
  'https://proj.supabase.co/storage/v1/object/public/modelos-viaturas/00000000-0000-0000-0000-00000f080a00/m.png',
  'sem ?v= também passa');
select is(public.api_imagem_modelo('00000000-0000-0000-0000-00000f080a00', null), null, 'sem foto: null');
select is(public.api_imagem_modelo('00000000-0000-0000-0000-00000f080b00', (select foto from p)),
  null, 'foto na pasta de outra org: null');
select is(public.api_imagem_modelo('00000000-0000-0000-0000-00000f080a00', 'https://marketing.exemplo/yaris.webp'),
  null, 'URL de fora: null');
select is(public.api_imagem_modelo('00000000-0000-0000-0000-00000f080a00', replace((select foto from p), 'https://', 'http://')),
  null, 'http sem s: null');
select is(public.api_imagem_modelo('00000000-0000-0000-0000-00000f080a00', replace((select foto from p), 'supabase.co/', 'supabase.co.mau.pt/')),
  null, 'domínio que só começa por supabase.co: null');
select is(public.api_imagem_modelo('00000000-0000-0000-0000-00000f080a00',
  'https://proj.supabase.co/storage/v1/object/public/modelos-viaturas/00000000-0000-0000-0000-00000f080a00/../00000000-0000-0000-0000-00000f080b00/m.png'),
  null, 'caminho com subpasta ou ..: null');
select is(public.api_imagem_modelo('00000000-0000-0000-0000-00000f080a00', replace((select foto from p), 'modelos-viaturas', 'documentos')),
  null, 'outro bucket: null');

-- 2) cartões de rent-a-car
create temp table rac as select public.api_modelos('00000000-0000-0000-0000-00000f080a00') as r;
grant select on rac to public;
select is((select x->>'imagem_url' from rac, jsonb_array_elements(rac.r) x where x->>'modelo' = 'Corolla'),
  (select foto from p), 'api_modelos: Corolla leva a foto do modelo');
select ok((select x->'imagem_url' = 'null'::jsonb from rac, jsonb_array_elements(rac.r) x where x->>'modelo' = 'Yaris'),
  'api_modelos: Yaris com URL de fora sai null, sem recorrer à viatura');
select ok(not exists (select 1 from rac, jsonb_array_elements(rac.r) x where x ? 'foto_path'),
  'api_modelos: nenhum cartão leva foto_path');
select ok((select r::text not like '%/fotos/%' from rac), 'api_modelos: nenhuma capa de viatura sai');
select is(public.api_modelo('00000000-0000-0000-0000-00000f080a00', '00000000-0000-0000-0000-00000f080d01')->>'imagem_url',
  (select foto from p), 'api_modelo herda a foto do modelo');
select is((select x->>'imagem_url'
             from jsonb_array_elements(public.api_disponibilidade('00000000-0000-0000-0000-00000f080a00',
                    (select inicio from p), (select inicio from p) + interval '3 days',
                    '00000000-0000-0000-0000-00000f080301', '00000000-0000-0000-0000-00000f080301')->'modelos') x
            where x->>'modelo' = 'Corolla'),
  (select foto from p), 'api_disponibilidade herda a foto do modelo');

-- 3) cartões TVDE
create temp table tv as select public.api_tvde_modelos('00000000-0000-0000-0000-00000f080a00') as r;
grant select on tv to public;
select is((select x->>'imagem_url' from tv, jsonb_array_elements(tv.r) x where x->>'modelo' = 'Corolla'),
  (select foto from p), 'api_tvde_modelos: Corolla leva a foto do modelo');
select ok((select x->'imagem_url' = 'null'::jsonb from tv, jsonb_array_elements(tv.r) x where x->>'modelo' = 'Yaris'),
  'api_tvde_modelos: Yaris sai null');
select ok(not exists (select 1 from tv, jsonb_array_elements(tv.r) x where x ? 'foto_path'),
  'api_tvde_modelos: nenhum cartão leva foto_path');
select is(public.api_tvde_modelo('00000000-0000-0000-0000-00000f080a00', '00000000-0000-0000-0000-00000f080d01')->>'imagem_url',
  (select foto from p), 'api_tvde_modelo herda a foto do modelo');
select is((select x->>'imagem_url'
             from jsonb_array_elements(public.api_tvde_disponibilidade('00000000-0000-0000-0000-00000f080a00',
                    (select inicio from p))->'modelos') x
            where x->>'modelo' = 'Corolla'),
  (select foto from p), 'api_tvde_disponibilidade herda a foto do modelo');

-- 4) categorias não mudam
select is((select x->>'imagem_url' from jsonb_array_elements(public.api_categorias('00000000-0000-0000-0000-00000f080a00')) x),
  'https://marketing.exemplo/berlina.webp', 'api_categorias continua com a imagem da categoria');

-- 5) a escolha pela viatura desapareceu
select hasnt_function('public', 'api_foto_modelo', array['uuid', 'uuid'], 'api_foto_modelo foi removida');

-- 6) privilégios: só service_role executa
create temp table fns as select unnest(array[
  'public.api_imagem_modelo(uuid,text)',
  'public.api_modelos_cartoes(uuid,uuid,text)',
  'public.api_tvde_modelos_cartoes(uuid)',
  'public.api_modelos(uuid,uuid,text)',
  'public.api_tvde_modelos(uuid)']) as f;
grant select on fns to public;
select ok(not has_function_privilege('anon', f, 'EXECUTE'), 'anon não executa ' || f) from fns;
select ok(not has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated não executa ' || f) from fns;
select ok(has_function_privilege('service_role', f, 'EXECUTE'), 'service_role executa ' || f) from fns;

select * from finish();
rollback;
