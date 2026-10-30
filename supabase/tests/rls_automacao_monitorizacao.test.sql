-- ============================================================
-- Quem lê o motor de automações: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Fixa a visibilidade de domain_events por org e permissão, e que as regras de
-- leitura das 4 tabelas do motor avaliam as funções uma vez por consulta
-- (migração 20261030120000). Por linha, a Monitorização estourava os 8 s.
-- ============================================================

begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000009b00ff', 'bootstrap@rls-automacao.pt'),
  ('00000000-0000-0000-0000-0000009b0001', 'admin-a@rls-automacao.pt'),
  ('00000000-0000-0000-0000-0000009b0002', 'comum-a@rls-automacao.pt'),
  ('00000000-0000-0000-0000-0000009b0003', 'admin-b@rls-automacao.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000009b0a00', 'Org Automação A', 'rls-automacao-a'),
  ('00000000-0000-0000-0000-0000009b0b00', 'Org Automação B', 'rls-automacao-b');

-- Grupos sem permissões: o comum só entraria pela permissão 'automacoes', que não tem.
insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-0000009bc001', 'Grupo neutro A', '00000000-0000-0000-0000-0000009b0a00'),
  ('00000000-0000-0000-0000-0000009bc002', 'Grupo neutro B', '00000000-0000-0000-0000-0000009b0b00');

-- handle_new_user_org pode ter metido estes utilizadores noutra organização:
-- os on conflict garantem que os valores DESTE teste vencem.
insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000009b0001', '00000000-0000-0000-0000-0000009b0a00', true,  '00000000-0000-0000-0000-0000009bc001'),
  ('00000000-0000-0000-0000-0000009b0002', '00000000-0000-0000-0000-0000009b0a00', false, '00000000-0000-0000-0000-0000009bc001'),
  ('00000000-0000-0000-0000-0000009b0003', '00000000-0000-0000-0000-0000009b0b00', true,  '00000000-0000-0000-0000-0000009bc002')
on conflict (user_id, org_id) do update
  set is_admin = excluded.is_admin, cargo_id = excluded.cargo_id;

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000009b0001', '00000000-0000-0000-0000-0000009b0a00'),
  ('00000000-0000-0000-0000-0000009b0002', '00000000-0000-0000-0000-0000009b0a00'),
  ('00000000-0000-0000-0000-0000009b0003', '00000000-0000-0000-0000-0000009b0b00')
on conflict (user_id) do update set org_id = excluded.org_id;

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by) values
  ('00000000-0000-0000-0000-0000009be001', '00000000-0000-0000-0000-0000009b0a00', 'teste.rls', 'teste', gen_random_uuid(), 'pgtap'),
  ('00000000-0000-0000-0000-0000009be002', '00000000-0000-0000-0000-0000009b0a00', 'teste.rls', 'teste', gen_random_uuid(), 'pgtap'),
  ('00000000-0000-0000-0000-0000009be003', '00000000-0000-0000-0000-0000009b0b00', 'teste.rls', 'teste', gen_random_uuid(), 'pgtap');

-- ── Leitura, utilizador a utilizador ───────────────────────

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009b0001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009b0001","role":"authenticated"}', true);
select set_eq(
  $$select id from public.domain_events where id::text like '00000000-0000-0000-0000-0000009be%'$$,
  array['00000000-0000-0000-0000-0000009be001', '00000000-0000-0000-0000-0000009be002']::uuid[],
  'admin da Org A vê os eventos da sua org e não os da Org B'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009b0002', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009b0002","role":"authenticated"}', true);
select is_empty(
  $$select id from public.domain_events where id::text like '00000000-0000-0000-0000-0000009be%'$$,
  'utilizador sem a permissão automacoes não vê eventos'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009b0003', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009b0003","role":"authenticated"}', true);
select set_eq(
  $$select id from public.domain_events where id::text like '00000000-0000-0000-0000-0000009be%'$$,
  array['00000000-0000-0000-0000-0000009be003']::uuid[],
  'admin da Org B só vê o evento da Org B'
);

reset role;

-- ── Forma das regras ───────────────────────────────────────

select is(
  (select count(*)::int
     from pg_policies
    where schemaname = 'public'
      and policyname in ('mt_domain_events_select', 'mt_automation_runs_select',
                         'mt_automation_logs_select', 'mt_automation_rules_select')
      and qual like '%SELECT is_current_user_admin()%'
      and qual like '%SELECT has_permission(%'),
  4,
  'as 4 regras de leitura do motor avaliam as funções uma vez por consulta'
);

-- ALTER POLICY só troca a expressão: tipo, papéis e comando ficam.
select results_eq(
  $$select tablename::text collate "default", permissive::text collate "default",
           roles::text collate "default", cmd::text collate "default"
      from pg_policies
     where schemaname = 'public'
       and policyname in ('mt_domain_events_select', 'mt_automation_runs_select',
                          'mt_automation_logs_select', 'mt_automation_rules_select')
     order by tablename$$,
  $$values ('automation_logs', 'PERMISSIVE', '{authenticated}', 'SELECT'),
           ('automation_rules', 'PERMISSIVE', '{authenticated}', 'SELECT'),
           ('automation_runs', 'PERMISSIVE', '{authenticated}', 'SELECT'),
           ('domain_events', 'PERMISSIVE', '{authenticated}', 'SELECT')$$,
  'as regras de leitura mantêm tipo, papéis e comando'
);

select has_index('public', 'automation_runs', 'idx_automation_runs_trigger_event',
  'runs encontram-se pelo evento que os disparou');
select has_index('public', 'automation_logs', 'idx_automation_logs_run_created',
  'o último log de cada run lê-se por índice');
select has_index('public', 'domain_events', 'idx_domain_events_org_occurred',
  'a timeline ordena os eventos da org por índice');

select * from finish();
rollback;
