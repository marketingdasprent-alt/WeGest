-- ============================================================
-- Um login de motorista em várias organizações — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Motorista que mudou da Década para a Premium Ride (04/11/2026): o mesmo login
-- tem ficha nas duas. Ver a migração 20261104100000.
--   (1) o mesmo login pode ter ficha em duas organizações;
--   (2) na mesma organização continua a ser uma ficha por login;
--   (3) minhas_orgs_motorista devolve as duas, a ativa primeiro;
--   (4) anon não chama a função.
-- ============================================================

begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000004b00aa', 'motorista@varias-orgs.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000004b0001', 'Org Antiga', 'varias-orgs-a'),
  ('00000000-0000-0000-0000-0000004b0002', 'Org Nova', 'varias-orgs-b');

insert into public.motoristas_ativos (id, org_id, nome, user_id, status_ativo) values
  ('00000000-0000-0000-0000-0000004b0b01', '00000000-0000-0000-0000-0000004b0001',
   'Motorista', '00000000-0000-0000-0000-0000004b00aa', false);

select lives_ok(
  $$ insert into public.motoristas_ativos (id, org_id, nome, user_id, status_ativo) values
       ('00000000-0000-0000-0000-0000004b0b02', '00000000-0000-0000-0000-0000004b0002',
        'Motorista', '00000000-0000-0000-0000-0000004b00aa', true) $$,
  'o mesmo login tem ficha noutra organização (1)'
);

select throws_ok(
  $$ insert into public.motoristas_ativos (id, org_id, nome, user_id) values
       ('00000000-0000-0000-0000-0000004b0b03', '00000000-0000-0000-0000-0000004b0002',
        'Motorista', '00000000-0000-0000-0000-0000004b00aa') $$,
  '23505',
  null,
  'na mesma organização continua a ser uma ficha por login (2)'
);

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000004b00aa"}', true);

select is(
  (select array_agg(org_id order by ficha_ativa desc) from public.minhas_orgs_motorista()),
  array['00000000-0000-0000-0000-0000004b0002', '00000000-0000-0000-0000-0000004b0001']::uuid[],
  'devolve as duas organizações (3)'
);

select is(
  (select org_id from public.minhas_orgs_motorista() limit 1),
  '00000000-0000-0000-0000-0000004b0002'::uuid,
  'a ficha ativa vem primeiro (3)'
);

select ok(
  not has_function_privilege('anon', 'public.minhas_orgs_motorista()', 'execute'),
  'anon não chama minhas_orgs_motorista (4)'
);

select * from finish();
rollback;
