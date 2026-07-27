-- ============================================================
-- Motor de Automação — notifications (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre COMPORTAMENTO específico de notifications que vai além do que
-- rls_org_isolation.test.sql já garante genericamente: só o destinatário
-- (ou um admin da própria org) pode ver/marcar como lida uma notificação,
-- e a tabela está corretamente configurada para Realtime.
-- ============================================================

begin;
select plan(8);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org A', 'notif-a'),
  ('00000000-0000-0000-0000-0000000b0000', 'Org B', 'notif-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0001', 'a1@notif.pt'),
  ('00000000-0000-0000-0000-0000000a0002', 'a2@notif.pt'),
  ('00000000-0000-0000-0000-0000000b0001', 'b1@notif.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0000'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000a0000'),
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000b0000');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0000', false),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000a0000', true),
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000b0000', false);

insert into public.notifications (id, org_id, destinatario_user_id, template_codigo, titulo) values
  ('00000000-0000-0000-0000-000000n1e001', '00000000-0000-0000-0000-0000000a0000', '00000000-0000-0000-0000-0000000a0001', 'teste.notif', 'Notificação 1'),
  ('00000000-0000-0000-0000-000000n2e001', '00000000-0000-0000-0000-0000000a0000', '00000000-0000-0000-0000-0000000a0002', 'teste.notif', 'Notificação 2'),
  ('00000000-0000-0000-0000-000000n3e001', '00000000-0000-0000-0000-0000000b0000', '00000000-0000-0000-0000-0000000b0001', 'teste.notif', 'Notificação 3');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}', true);

-- 1. User A1 (não-admin) só vê a sua própria notificação.
select is(
  (select count(*)::int from public.notifications),
  1,
  'user A1 (não-admin) só vê a sua própria notificação'
);

-- 2. ...e é especificamente a n1.
select is(
  (select id from public.notifications limit 1),
  '00000000-0000-0000-0000-000000n1e001'::uuid,
  'a notificação visível ao user A1 é a n1'
);

-- 3. User A1 não consegue marcar como lida a notificação de outra pessoa (n2).
update public.notifications set lida = true where id = '00000000-0000-0000-0000-000000n2e001';

reset role;

select is(
  (select lida from public.notifications where id = '00000000-0000-0000-0000-000000n2e001'),
  false,
  'user A1 não consegue marcar como lida a notificação do user A2'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0002', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}', true);

-- 4. User A2 (admin da Org A) vê as duas notificações da sua org.
select is(
  (select count(*)::int from public.notifications),
  2,
  'user A2 (admin) vê todas as notificações da sua org'
);

-- 5. User A2 consegue marcar a própria notificação como lida.
update public.notifications set lida = true where id = '00000000-0000-0000-0000-000000n2e001';

select is(
  (select lida from public.notifications where id = '00000000-0000-0000-0000-000000n2e001'),
  true,
  'user A2 consegue marcar a sua própria notificação como lida'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}', true);

-- 6. Não vê a notificação da Org B (isolamento entre orgs).
select is(
  (select count(*)::int from public.notifications where id = '00000000-0000-0000-0000-000000n3e001'),
  0,
  'user A1 não vê a notificação da Org B'
);

reset role;

-- 7. REPLICA IDENTITY FULL está ativo (necessário para o Realtime).
select is(
  (select relreplident from pg_class where oid = 'public.notifications'::regclass),
  'f',
  'notifications tem REPLICA IDENTITY FULL'
);

-- 8. A tabela está na publicação supabase_realtime.
select is(
  (select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'),
  1,
  'notifications está na publicação supabase_realtime'
);

select * from finish();
rollback;
