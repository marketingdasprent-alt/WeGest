-- ============================================================
-- perfis_org: nomes de colegas sem abrir profiles (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Ver a migração 20261021140000. Provas:
--   (1) um membro SEM permissões recebe o nome do colega da sua org, e nunca
--       o de outra org;
--   (2) a leitura directa de profiles pelo mesmo membro não devolve o colega
--       (é por isso que a função existe — mt_profiles_select exige
--       calendario_ver_gestores ou admin_utilizadores);
--   (3) anon não executa a função (REVOKE);
--   (4) array vazio, NULL e mais de 500 ids devolvem 0 linhas;
--   (5) os grants: anon sem EXECUTE, authenticated com.
--
-- Nada depende de dados de produção.
-- ============================================================

begin;
select plan(16);

-- Bootstrap antes das orgs: consome a vaga de "primeiro utilizador da
-- instalação" sem lhe dar org nem user_org_ativa.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f00ff', 'bootstrap@perfis-org.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0a00', 'Org Perfis A', 'perfis-org-a'),
  ('00000000-0000-0000-0000-0000000f0b00', 'Org Perfis B', 'perfis-org-b');

-- Colaboradores sem convite nem app_metadata: handle_new_user_org cria o
-- profile com o nome e não atribui org nenhuma; as memberships vão à mão.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000f0a01', 'a1@perfis-org.pt', jsonb_build_object('nome', 'Alice Um')),
  ('00000000-0000-0000-0000-0000000f0a02', 'a2@perfis-org.pt', jsonb_build_object('nome', 'Ana Dois')),
  ('00000000-0000-0000-0000-0000000f0b01', 'b1@perfis-org.pt', jsonb_build_object('nome', 'Bruno Um'));

-- Sem cargo nem is_admin: o caso do Gestor de Assistência / Mecânico que via
-- "Desconhecido" em todos os tickets.
insert into public.user_organizacoes (user_id, org_id, role, cargo_id, is_admin) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0a00', 'member', null, false),
  ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0a00', 'member', null, false),
  ('00000000-0000-0000-0000-0000000f0b01', '00000000-0000-0000-0000-0000000f0b00', 'member', null, false);

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0a00'),
  ('00000000-0000-0000-0000-0000000f0b01', '00000000-0000-0000-0000-0000000f0b00');

-- org_id no profile como em produção, para a prova (2) bater no ramo
-- "mesma org mas sem permissão" da política, e não num org_id nulo.
update public.profiles set org_id = '00000000-0000-0000-0000-0000000f0a00'
 where id in ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0a02');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000f0b00'
 where id = '00000000-0000-0000-0000-0000000f0b01';

select is(
  (select count(*)::int from public.profiles
    where id in ('00000000-0000-0000-0000-0000000f0a01',
                 '00000000-0000-0000-0000-0000000f0a02',
                 '00000000-0000-0000-0000-0000000f0b01')),
  3,
  'fixtures: o trigger de signup criou os três perfis'
);

-- ── (1) A1, membro sem permissões da org A ─────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f0a01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f0a01","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.perfis_org(
     array['00000000-0000-0000-0000-0000000f0a02',
           '00000000-0000-0000-0000-0000000f0b01']::uuid[])),
  1,
  '(1) A1 sem permissões recebe só o colega da sua org'
);
select is(
  (select nome from public.perfis_org(
     array['00000000-0000-0000-0000-0000000f0a02',
           '00000000-0000-0000-0000-0000000f0b01']::uuid[])),
  'Ana Dois',
  '(1) e vem com o nome certo'
);
select is(
  (select id from public.perfis_org(
     array['00000000-0000-0000-0000-0000000f0a02',
           '00000000-0000-0000-0000-0000000f0b01']::uuid[])),
  '00000000-0000-0000-0000-0000000f0a02'::uuid,
  '(1) o id devolvido é o de A2, nunca o de B1'
);

-- ── (2) A leitura directa de profiles não chega ────────────

select is(
  (select count(*)::int from public.profiles
    where id in ('00000000-0000-0000-0000-0000000f0a02',
                 '00000000-0000-0000-0000-0000000f0b01')),
  0,
  '(2) a leitura directa de profiles por A1 não devolve o colega: a função é necessária'
);
select is(
  (select count(*)::int from public.profiles
    where id = '00000000-0000-0000-0000-0000000f0a01'),
  1,
  '(2) A1 continua a ver o seu próprio perfil (a sessão está mesmo activa)'
);

-- ── (4) Entradas vazias e o tecto de 500 ───────────────────

select is(
  (select count(*)::int from public.perfis_org(array[]::uuid[])),
  0,
  '(4) array vazio devolve 0 linhas'
);
select is(
  (select count(*)::int from public.perfis_org(null::uuid[])),
  0,
  '(4) NULL devolve 0 linhas'
);
select is(
  (select count(*)::int from public.perfis_org(
     array_fill('00000000-0000-0000-0000-0000000f0a02'::uuid, array[501]))),
  0,
  '(4) mais de 500 ids devolve 0 linhas: a RPC não serve para enumerar perfis'
);

-- ── (1) B1 não atravessa para a org A ──────────────────────

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f0b01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f0b01","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.perfis_org(
     array['00000000-0000-0000-0000-0000000f0a01',
           '00000000-0000-0000-0000-0000000f0a02',
           '00000000-0000-0000-0000-0000000f0b01']::uuid[])),
  1,
  '(1) B1 só recebe membros da org B, mesmo pedindo os ids da org A'
);
select is(
  (select nome from public.perfis_org(
     array['00000000-0000-0000-0000-0000000f0a01',
           '00000000-0000-0000-0000-0000000f0a02',
           '00000000-0000-0000-0000-0000000f0b01']::uuid[])),
  'Bruno Um',
  '(1) e esse membro é o próprio B1'
);

-- ── Sem sessão: authenticated sem JWT não lê nada ──────────

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set local role authenticated;

select is(
  (select count(*)::int from public.perfis_org(
     array['00000000-0000-0000-0000-0000000f0a02']::uuid[])),
  0,
  'sem sessão (auth.uid() a NULL) a função não devolve nada'
);

-- ── (3) anon é recusado ────────────────────────────────────

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok(
  $$ select * from public.perfis_org(array['00000000-0000-0000-0000-0000000f0a02']::uuid[]) $$,
  '42501',
  null,
  '(3) anon não executa perfis_org'
);

reset role;

-- ── (5) Grants e definição ─────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.perfis_org(uuid[])', 'EXECUTE'),
  '(5) anon não tem EXECUTE em perfis_org'
);
select ok(
  has_function_privilege('authenticated', 'public.perfis_org(uuid[])', 'EXECUTE'),
  '(5) authenticated tem EXECUTE em perfis_org'
);
select ok(
  (select p.prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'perfis_org'),
  'perfis_org é SECURITY DEFINER: é o que lhe permite passar pela RLS de profiles'
);

select * from finish();
rollback;
