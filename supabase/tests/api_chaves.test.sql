-- ============================================================
-- Chaves de API genéricas — api_chaves, api_chaves_criar, api_chave_por_hash
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
-- A chave em claro só sai uma vez; a tabela guarda o hash. Só admins da org
-- criam, listam e desactivam; ninguém apaga.
-- ============================================================
begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a01ff', 'bootstrap@apichaves.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0a00', 'Org Chaves A', 'chaves-a'),
  ('00000000-0000-0000-0000-0000000a0b00', 'Org Chaves B', 'chaves-b');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0101', 'admin@apichaves.pt'),
  ('00000000-0000-0000-0000-0000000a0102', 'user@apichaves.pt');
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000a0101', '00000000-0000-0000-0000-0000000a0a00'),
  ('00000000-0000-0000-0000-0000000a0102', '00000000-0000-0000-0000-0000000a0a00');
insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000a0101', '00000000-0000-0000-0000-0000000a0a00', true),
  ('00000000-0000-0000-0000-0000000a0102', '00000000-0000-0000-0000-0000000a0a00', false);

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
-- O temp table pertence a authenticated; a prova 3 lê-o como service_role.
grant select on criada to service_role;
select matches((select chave from criada), '^wg_ra_[0-9a-f]{48}$', 'chave tem prefixo wg_ra_ e 48 hex');
select is((select prefixo from criada), left((select chave from criada), 10), 'prefixo são os 10 primeiros caracteres');
select is(
  (select api_key_hash from public.api_chaves where id = (select id from criada)),
  encode(extensions.digest((select chave from criada), 'sha256'), 'hex'),
  'a tabela guarda o sha256 da chave');
select is((select api_key from public.api_chaves where id = (select id from criada)), null, 'a chave em claro não fica na tabela');

-- 3) api_chave_por_hash devolve a org e as permissões
-- Só o service_role (a edge function) executa esta função; authenticated foi revogado.
set local role service_role;
select is(
  (select org_id from public.api_chave_por_hash(encode(extensions.digest((select chave from criada), 'sha256'), 'hex'))),
  '00000000-0000-0000-0000-0000000a0a00'::uuid,
  'api_chave_por_hash resolve a organização');

-- 4) não-admin não cria
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0102","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.api_chaves_criar('X', 'rent_a_car', array['catalogo:read'], null, null) $$,
  'P0001', null, 'utilizador sem admin não cria chaves');

-- 5) escopo inválido é recusado
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0101","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.api_chaves_criar('X', 'faturas', array['catalogo:read'], null, null) $$,
  '23514', null, 'escopo fora da lista rebenta no CHECK');

select * from finish();
rollback;
