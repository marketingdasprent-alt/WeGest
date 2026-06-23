-- ============================================================
-- RLS — Isolamento multi-tenant por org (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre o invariante mais crítico do produto (SaaS multi-tenant):
-- um utilizador NUNCA pode ver/escrever dados de outra organização.
--
-- Dois níveis:
--   META  — todas as tabelas `public` com coluna org_id (exceto as
--           documentadas) têm RLS ativa + a policy RESTRICTIVE
--           `rls_org_isolation`. Apanha o erro "nova tabela com org_id
--           sem política" — a forma mais provável de abrir um data leak.
--   COMPORTAMENTO — com 2 orgs e 2 users reais, o user A só vê a sua org
--           e o WITH CHECK bloqueia escrita cross-org.
--
-- Ver [[project-rls-org-isolation]] e migration 20260520000006.
-- ============================================================

begin;
select plan(7);

-- Conjunto de tabelas alvo: base tables em public com org_id, menos as
-- exclusões legítimas (iguais às da migration de isolamento).
create temporary table _org_tables on commit drop as
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a
    on a.attrelid = c.oid and a.attname = 'org_id' and a.attnum > 0 and not a.attisdropped
  where c.relkind = 'r'
    and c.relname not in ('user_org_ativa', 'user_organizacoes', 'convites', 'profiles');

-- ── META ────────────────────────────────────────────────────
-- 1. Há pelo menos uma tabela alvo (sanidade do próprio teste).
select cmp_ok(
  (select count(*)::int from _org_tables), '>', 0,
  'existem tabelas public com org_id para proteger'
);

-- 2. Todas têm RLS ativa.
select is(
  (select count(*)::int from _org_tables where relrowsecurity = false),
  0,
  'todas as tabelas com org_id têm RLS ativa'
);

-- 3. Todas têm a policy rls_org_isolation.
select is(
  (
    select count(*)::int
    from _org_tables t
    where not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = t.relname
        and p.policyname = 'rls_org_isolation'
    )
  ),
  0,
  'todas as tabelas com org_id têm a policy rls_org_isolation'
);

-- 4. Essa policy é sempre RESTRICTIVE (PERMISSIVE não AND'aria com as outras).
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and policyname = 'rls_org_isolation'
      and permissive <> 'RESTRICTIVE'
  ),
  0,
  'rls_org_isolation é sempre RESTRICTIVE'
);

-- ── COMPORTAMENTO ───────────────────────────────────────────
-- Seed (como role de migração, antes de trocar para authenticated).
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org A', 'rls-test-a'),
  ('00000000-0000-0000-0000-0000000b0000', 'Org B', 'rls-test-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0001', 'a@rls-test.pt'),
  ('00000000-0000-0000-0000-0000000b0001', 'b@rls-test.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0000'),
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000b0000');

-- Tabela-fixture com a MESMA policy real (replicada da migration), para
-- exercer o mecanismo sem depender das colunas NOT NULL de tabelas de negócio.
create table public._rls_fixture (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  label text
);
alter table public._rls_fixture enable row level security;
create policy rls_org_isolation on public._rls_fixture as restrictive for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id is null or org_id = public.get_current_org_id());
-- policy permissiva base (a RESTRICTIVE só estreita; sem permissiva ninguém vê nada).
create policy allow_auth on public._rls_fixture for all to authenticated
  using (true) with check (true);

insert into public._rls_fixture (org_id, label) values
  ('00000000-0000-0000-0000-0000000a0000', 'row-da-org-a'),
  ('00000000-0000-0000-0000-0000000b0000', 'row-da-org-b');

-- Impersonar o user A (cobre as duas implementações de auth.uid()).
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}',
  true
);

-- 5. A org ativa do user A resolve para Org A.
select is(
  public.get_current_org_id(),
  '00000000-0000-0000-0000-0000000a0000'::uuid,
  'get_current_org_id() do user A devolve Org A'
);

-- 6. User A só vê a linha da sua org.
select is(
  (select count(*)::int from public._rls_fixture),
  1,
  'user A vê apenas as linhas da sua org'
);

-- 7. WITH CHECK bloqueia escrita para outra org.
select throws_ok(
  $$ insert into public._rls_fixture (org_id, label)
     values ('00000000-0000-0000-0000-0000000b0000', 'tentativa-cross-org') $$,
  '42501',
  null,
  'WITH CHECK impede o user A de escrever na Org B'
);

reset role;
select * from finish();
rollback;
