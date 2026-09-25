-- ============================================================
-- Aceitar convite só pelo titular — marcar_convite_usado() (20260925120625)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Auditoria 2026-09-25 (F02): uma conta existente só entra noutra organização
-- quando o próprio titular, autenticado e com o email confirmado, aceita o
-- convite. E o REST deixa de permitir contornar o convite (INSERT ou
-- reatribuição de uma pertença em user_organizacoes).
-- ============================================================

begin;
select plan(17);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação" antes das
-- organizações, para o trigger de signup não tratar o titular como o primeiro.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000ac00ff', 'bootstrap@convite.test');

insert into public.organizacoes (id, nome, codigo, ativa) values
  ('00000000-0000-4000-8000-000000ac0001', 'Convite A', 'convite-teste-a', true),
  ('00000000-0000-4000-8000-000000ac0002', 'Convite B', 'convite-teste-b', true);
insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-4000-8000-000000ac0011', 'Admin convite', '00000000-0000-4000-8000-000000ac0001'),
  ('00000000-0000-4000-8000-000000ac0012', 'Cargo B convite', '00000000-0000-4000-8000-000000ac0002');

-- O titular já existe na org B (app_metadata, como o create-user faz).
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-4000-8000-000000ac0021', 'titular@convite.test', now(),
   '{"org_id":"00000000-0000-4000-8000-000000ac0002","cargo_id":"00000000-0000-4000-8000-000000ac0012"}'),
  ('00000000-0000-4000-8000-000000ac0022', 'outro@convite.test', now(),
   '{"org_id":"00000000-0000-4000-8000-000000ac0002"}');
insert into public.user_organizacoes (user_id, org_id, role, cargo_id, is_admin) values
  ('00000000-0000-4000-8000-000000ac0021', '00000000-0000-4000-8000-000000ac0002', 'member',
   '00000000-0000-4000-8000-000000ac0012', false)
on conflict (user_id, org_id) do nothing;
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-4000-8000-000000ac0021', '00000000-0000-4000-8000-000000ac0002')
on conflict (user_id) do update set org_id = excluded.org_id;

insert into public.convites (email, token, expires_at, cargo_id, org_id) values
  ('titular@convite.test', 'convite-valido-f02', now() + interval '1 day',
   '00000000-0000-4000-8000-000000ac0011', '00000000-0000-4000-8000-000000ac0001'),
  ('titular@convite.test', 'convite-expirado-f02', now() - interval '1 day',
   null, '00000000-0000-4000-8000-000000ac0001'),
  ('titular@convite.test', 'convite-cargo-cruzado-f02', now() + interval '1 day',
   '00000000-0000-4000-8000-000000ac0012', '00000000-0000-4000-8000-000000ac0001');

-- ── Quem não é o titular ────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000ac0022', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000ac0022","role":"authenticated"}', true);

select is(public.marcar_convite_usado('convite-valido-f02'), false,
  'outra conta autenticada não aceita o convite do titular');

-- ── Titular, com as condições a falhar uma a uma ────────────

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000ac0021', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000ac0021","role":"authenticated"}', true);

update auth.users set email_confirmed_at = null where id = '00000000-0000-4000-8000-000000ac0021';
select is(public.marcar_convite_usado('convite-valido-f02'), false,
  'sem email confirmado o titular não aceita');
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-000000ac0021';

select is(public.marcar_convite_usado('convite-expirado-f02'), false,
  'convite expirado é recusado');
select is(public.marcar_convite_usado('convite-cargo-cruzado-f02'), false,
  'convite com cargo de outra organização é recusado');

-- ── Titular aceita ──────────────────────────────────────────

select is(public.marcar_convite_usado('convite-valido-f02'), true,
  'o titular autenticado e confirmado aceita o convite');
select is(public.marcar_convite_usado('convite-valido-f02'), false,
  'o mesmo convite não se reutiliza');

select ok(exists (
  select 1 from public.user_organizacoes
  where user_id = '00000000-0000-4000-8000-000000ac0021'
    and org_id = '00000000-0000-4000-8000-000000ac0001'
    and cargo_id = '00000000-0000-4000-8000-000000ac0011' and is_admin),
  'a pertença nova fica com o cargo do convite');
select ok(exists (
  select 1 from public.user_org_ativa
  where user_id = '00000000-0000-4000-8000-000000ac0021'
    and org_id = '00000000-0000-4000-8000-000000ac0002'),
  'aceitar não muda a organização activa');
select ok(exists (
  select 1 from auth.users
  where id = '00000000-0000-4000-8000-000000ac0021' and email = 'titular@convite.test'),
  'aceitar não altera a identidade global');

-- ── Quem pode criar convites ────────────────────────────────
-- A política lia profiles.is_admin, que é global: um admin da org B que seja
-- membro sem admin na A criava na A convites de Administrador. Tem de ser admin
-- da própria org activa (is_current_user_admin).

update public.profiles set is_admin = true where id = '00000000-0000-4000-8000-000000ac0022';
insert into public.user_organizacoes (user_id, org_id, role, is_admin) values
  ('00000000-0000-4000-8000-000000ac0022', '00000000-0000-4000-8000-000000ac0001', 'member', false)
on conflict (user_id, org_id) do update set is_admin = false;
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-4000-8000-000000ac0022', '00000000-0000-4000-8000-000000ac0001')
on conflict (user_id) do update set org_id = excluded.org_id;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000ac0022', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000ac0022","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ insert into public.convites (email, token, expires_at, cargo_id, org_id)
     values ('segunda@convite.test', 'convite-escalada-f02', now() + interval '1 day',
             '00000000-0000-4000-8000-000000ac0011', '00000000-0000-4000-8000-000000ac0001') $$,
  '42501', null,
  'admin de outra org, sem admin na org activa, não cria convites'
);
reset role;

-- O titular é admin da org A (cargo do convite aceite acima).
update public.user_org_ativa set org_id = '00000000-0000-4000-8000-000000ac0001'
where user_id = '00000000-0000-4000-8000-000000ac0021';
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000ac0021', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000ac0021","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into public.convites (email, token, expires_at, org_id)
     values ('colega@convite.test', 'convite-legitimo-f02', now() + interval '1 day',
             '00000000-0000-4000-8000-000000ac0001') $$,
  'admin da org activa continua a criar convites'
);
reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

-- ── Quem convida (20260925160000) ───────────────────────────
-- Quem abre o link tem de ver que organização o está a convidar antes de
-- aceitar; o convite legítimo acima ainda não foi usado.
select is(
  (select org_nome from public.validar_convite_token('convite-legitimo-f02')),
  'Convite A',
  'validar_convite_token devolve o nome da organização que convida'
);
select ok(has_function_privilege('anon', 'public.validar_convite_token(text)', 'execute'),
  'o link de convite continua a validar-se sem sessão');

-- ── Grants ──────────────────────────────────────────────────

select ok(not has_function_privilege('anon', 'public.marcar_convite_usado(text)', 'execute'),
  'anon deixa de consumir convites');
select ok(not has_table_privilege('authenticated', 'public.user_organizacoes', 'insert'),
  'o REST não cria pertenças por INSERT');
select ok(not has_column_privilege('authenticated', 'public.user_organizacoes', 'user_id', 'update'),
  'o REST não reatribui uma pertença a outro utilizador');
select ok(has_column_privilege('authenticated', 'public.user_organizacoes', 'cargo_id', 'update'),
  'a edição legítima do cargo continua possível');

select * from finish();
rollback;
