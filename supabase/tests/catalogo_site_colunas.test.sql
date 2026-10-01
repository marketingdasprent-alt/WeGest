-- Colunas do site no modelo, estações e tarifa; uma tarifa_site activa por org.
begin;
select plan(12);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000b01ff', 'bootstrap@catalogo.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000b0a00', 'Org Catalogo', 'catalogo-a');

select has_column('public', 'viatura_modelos', 'caixa', 'modelo tem caixa');
select has_column('public', 'viatura_modelos', 'lugares', 'modelo tem lugares');
select has_column('public', 'viatura_modelos', 'imagem_url', 'modelo tem imagem_url');
select has_column('public', 'estacoes', 'horario', 'estação tem horário');
select has_column('public', 'renting_tarifas', 'tarifa_site', 'tarifa tem tarifa_site');

-- bucket modelos-viaturas: 4 políticas; a leitura só para quem tem sessão
-- (as imagens servem-se por /object/public/, o anónimo não lista o bucket).
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'modelos_viaturas_%'),
  4, 'as 4 políticas do bucket modelos-viaturas existem');
select ok(
  (select qual from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'modelos_viaturas_leitura')
    like '%foldername%',
  'listagem do bucket só na pasta da própria organização');
select is(
  (select roles from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'modelos_viaturas_leitura'),
  '{authenticated}'::name[], 'leitura do bucket só para authenticated');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000b0aa1', '00000000-0000-0000-0000-0000000b0a00', 'Renault');
select throws_ok(
  $$ insert into public.viatura_modelos (org_id, marca_id, nome, caixa)
     values ('00000000-0000-0000-0000-0000000b0a00', '00000000-0000-0000-0000-0000000b0aa1', 'Clio', 'cvt') $$,
  '23514', null, 'caixa só aceita manual ou automatica');
select lives_ok(
  $$ insert into public.viatura_modelos (org_id, marca_id, nome, caixa, lugares, portas, bagageira)
     values ('00000000-0000-0000-0000-0000000b0a00', '00000000-0000-0000-0000-0000000b0aa1', 'Clio', 'manual', 5, 5, 2) $$,
  'modelo com características válidas grava');

insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site) values
  ('00000000-0000-0000-0000-0000000b0e01', '00000000-0000-0000-0000-0000000b0a00', 'Geral', 'renting', true, true);
select throws_ok(
  $$ insert into public.renting_tarifas (org_id, nome, tipo, ativa, tarifa_site)
     values ('00000000-0000-0000-0000-0000000b0a00', 'Outra', 'renting', true, true) $$,
  '23505', null, 'só uma tarifa_site activa por organização');
select lives_ok(
  $$ insert into public.renting_tarifas (org_id, nome, tipo, ativa, tarifa_site)
     values ('00000000-0000-0000-0000-0000000b0a00', 'Antiga', 'renting', false, true) $$,
  'uma tarifa_site inactiva não conta para o índice');

select * from finish();
rollback;
