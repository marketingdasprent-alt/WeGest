-- ============================================================
-- Chaves de API genéricas — api_chaves, api_chaves_criar, api_chave_por_hash
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
-- A chave em claro só sai uma vez; a tabela guarda o hash. Só admins da org
-- criam, listam e desactivam; ninguém apaga. O browser nunca lê api_key,
-- api_secret nem api_key_hash (privilégios por coluna) e nunca insere.
-- ============================================================
begin;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a01ff', 'bootstrap@apichaves.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0a00', 'Org Chaves A', 'chaves-a'),
  ('00000000-0000-0000-0000-0000000a0b00', 'Org Chaves B', 'chaves-b');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0101', 'admin@apichaves.pt'),
  ('00000000-0000-0000-0000-0000000a0102', 'user@apichaves.pt'),
  ('00000000-0000-0000-0000-0000000a0103', 'admin-b@apichaves.pt');
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000a0101', '00000000-0000-0000-0000-0000000a0a00'),
  ('00000000-0000-0000-0000-0000000a0102', '00000000-0000-0000-0000-0000000a0a00'),
  ('00000000-0000-0000-0000-0000000a0103', '00000000-0000-0000-0000-0000000a0b00');
insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000a0101', '00000000-0000-0000-0000-0000000a0a00', true),
  ('00000000-0000-0000-0000-0000000a0102', '00000000-0000-0000-0000-0000000a0a00', false),
  ('00000000-0000-0000-0000-0000000a0103', '00000000-0000-0000-0000-0000000a0b00', true);

-- 1) tabela renomeada e colunas novas
select has_table('public', 'api_chaves', 'api_chaves existe');
select hasnt_table('public', 'primavera_api_keys', 'primavera_api_keys foi renomeada');
select has_column('public', 'api_chaves', 'api_key_hash', 'tem api_key_hash');
select has_column('public', 'api_chaves', 'escopo', 'tem escopo');
select has_table('public', 'api_pedidos', 'api_pedidos existe');
select ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'api_chaves'
                 and policyname = 'Admins podem gerir API keys'),
  'política antiga FOR ALL do Primavera foi removida');

-- 2) admin cria e recebe a chave em claro uma vez
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0101","role":"authenticated"}', true);
create temp table criada as
  select * from public.api_chaves_criar('Site', 'rent_a_car', array['catalogo:read'], null, null);
-- O temp table pertence a authenticated; as provas seguintes lêem-no como service_role.
grant select on criada to service_role;
select matches((select chave from criada), '^wg_ra_[0-9a-f]{48}$', 'chave tem prefixo wg_ra_ e 48 hex');
select is((select prefixo from criada), left((select chave from criada), 10), 'prefixo são os 10 primeiros caracteres');

-- 3) o que fica na tabela e a resolução por hash
-- api_key e api_key_hash não têm SELECT para authenticated; só o service_role
-- (a edge function) os lê e só ele executa api_chave_por_hash.
set local role service_role;
select is(
  (select api_key_hash from public.api_chaves where id = (select id from criada)),
  encode(extensions.digest((select chave from criada), 'sha256'), 'hex'),
  'a tabela guarda o sha256 da chave');
select is((select api_key from public.api_chaves where id = (select id from criada)), null, 'a chave em claro não fica na tabela');
select is(
  (select org_id from public.api_chave_por_hash(encode(extensions.digest((select chave from criada), 'sha256'), 'hex'))),
  '00000000-0000-0000-0000-0000000a0a00'::uuid,
  'api_chave_por_hash resolve a organização');
select ok(
  not has_function_privilege('authenticated', 'public.api_chave_por_hash(text)', 'EXECUTE'),
  'authenticated não executa api_chave_por_hash');

-- 4) isolamento e privilégios pelo browser
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0103","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.api_chaves where id = (select id from criada)),
  0, 'admin da org B não vê a chave da org A');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0102","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.api_chaves where org_id = '00000000-0000-0000-0000-0000000a0a00'),
  0, 'não-admin da org A não vê as chaves');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0101","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.api_chaves where id = (select id from criada)),
  1, 'admin da org A vê a sua chave');
select throws_ok(
  $$ insert into public.api_chaves (org_id, nome, escopo)
     values ('00000000-0000-0000-0000-0000000a0a00', 'Directa', 'rent_a_car') $$,
  '42501', null, 'insert directo em api_chaves é recusado');
select throws_ok(
  $$ delete from public.api_chaves where id = (select id from criada) $$,
  '42501', null, 'delete directo em api_chaves é recusado');
select throws_ok(
  $$ insert into public.api_pedidos (org_id, metodo, caminho, estado_http)
     values ('00000000-0000-0000-0000-0000000a0a00', 'GET', '/v1/modelos', 200) $$,
  '42501', null, 'authenticated não insere em api_pedidos');

-- 5) não-admin não cria
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0102","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.api_chaves_criar('X', 'rent_a_car', array['catalogo:read'], null, null) $$,
  'P0001', null, 'utilizador sem admin não cria chaves');

-- 6) entradas inválidas são recusadas antes de gravar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0101","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.api_chaves_criar('X', 'faturas', array['catalogo:read'], null, null) $$,
  '23514', null, 'escopo fora da lista rebenta no CHECK');
select throws_ok(
  $$ select * from public.api_chaves_criar('X', 'rent_a_car', array['tudo:write'], null, null) $$,
  'P0001', null, 'permissão desconhecida é recusada');
select throws_ok(
  $$ select * from public.api_chaves_criar('X', 'rent_a_car', array['catalogo:read'], now() - interval '1 day', null) $$,
  'P0001', null, 'expiração no passado é recusada');

select * from finish();
rollback;
