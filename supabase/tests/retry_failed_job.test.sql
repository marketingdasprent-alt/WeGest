-- ============================================================
-- Motor de Automação — retry_failed_job() (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre: um admin consegue reagendar um failed_job da sua própria org
-- (tanto de automation_runs como de notification_queue), um utilizador
-- sem permissão é bloqueado, e um admin de outra org não consegue
-- reagendar um failed_job que não é da sua organização.
-- ============================================================

begin;
select plan(7);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org A', 'retry-a'),
  ('00000000-0000-0000-0000-0000000b0000', 'Org B', 'retry-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0001', 'admin@retry.pt'),
  ('00000000-0000-0000-0000-0000000a0002', 'semperm@retry.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0000'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000a0000');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0000', true),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000a0000', false);

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000460001', '00000000-0000-0000-0000-0000000a0000', 'teste.regra', 'Regra', 'teste.evento', 'notificacao', '{"template_codigo":"teste.template","titulo":"Titulo de Teste"}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, status, attempt, max_attempts, error_message) values
  ('00000000-0000-0000-0000-0000004c0001', '00000000-0000-0000-0000-000000460001', '00000000-0000-0000-0000-0000000a0000', 'failed', 3, 3, 'erro final');

insert into public.failed_jobs (id, source_table, source_id, org_id, job_type, attempts, last_error) values
  ('00000000-0000-0000-0000-000000fd0001', 'automation_runs', '00000000-0000-0000-0000-0000004c0001', '00000000-0000-0000-0000-0000000a0000', 'automation_rule', 3, 'erro final');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}', true);

-- 1. Admin consegue reagendar um failed_job da sua própria org.
select lives_ok(
  $$ select public.retry_failed_job('00000000-0000-0000-0000-000000fd0001') $$,
  'admin consegue reagendar um failed_job da sua org'
);

reset role;

-- 2. O automation_run volta a pending...
select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-0000004c0001'),
  'pending',
  'retry_failed_job() volta a pôr o automation_run em pending'
);

-- 3. ...com o attempt reposto a 0.
select is(
  (select attempt from public.automation_runs where id = '00000000-0000-0000-0000-0000004c0001'),
  0,
  'retry_failed_job() repõe o attempt a 0'
);

-- 4. O failed_job fica marcado como resolvido.
select is(
  (select resolved from public.failed_jobs where id = '00000000-0000-0000-0000-000000fd0001'),
  true,
  'retry_failed_job() marca o failed_job como resolvido'
);

-- Cenário: também funciona para notification_queue.
insert into public.notifications (id, org_id, destinatario_user_id, template_codigo, titulo) values
  ('00000000-0000-0000-0000-000000f1e001', '00000000-0000-0000-0000-0000000a0000', '00000000-0000-0000-0000-0000000a0001', 'teste.notif', 'Teste');

insert into public.notification_queue (id, notification_id, org_id, canal, destinatario, template_codigo, status, attempt, max_attempts, error_message) values
  ('00000000-0000-0000-0000-000000f90001', '00000000-0000-0000-0000-000000f1e001', '00000000-0000-0000-0000-0000000a0000', 'email', 'x@x.pt', 'teste.notif', 'failed', 5, 5, 'smtp erro');

insert into public.failed_jobs (id, source_table, source_id, org_id, job_type, attempts, last_error) values
  ('00000000-0000-0000-0000-000000fd0002', 'notification_queue', '00000000-0000-0000-0000-000000f90001', '00000000-0000-0000-0000-0000000a0000', 'email', 5, 'smtp erro');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}', true);

select public.retry_failed_job('00000000-0000-0000-0000-000000fd0002');

reset role;

-- 5. notification_queue também volta a pending.
select is(
  (select status from public.notification_queue where id = '00000000-0000-0000-0000-000000f90001'),
  'pending',
  'retry_failed_job() também funciona para notification_queue'
);

-- Cenário: sem permissão (nem admin, nem recurso automacoes).
insert into public.automation_runs (id, rule_id, org_id, status, attempt, max_attempts) values
  ('00000000-0000-0000-0000-0000004c0002', '00000000-0000-0000-0000-000000460001', '00000000-0000-0000-0000-0000000a0000', 'failed', 1, 1);

insert into public.failed_jobs (id, source_table, source_id, org_id, job_type, attempts, last_error) values
  ('00000000-0000-0000-0000-000000fd0003', 'automation_runs', '00000000-0000-0000-0000-0000004c0002', '00000000-0000-0000-0000-0000000a0000', 'automation_rule', 1, 'erro');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0002', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}', true);

-- 6. Bloqueado.
select throws_ok(
  $$ select public.retry_failed_job('00000000-0000-0000-0000-000000fd0003') $$,
  null,
  'sem permissão para reagendar jobs falhados',
  'user sem permissão nem admin não consegue reagendar um failed_job'
);

reset role;

-- Cenário: proteção cross-org.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000460002', '00000000-0000-0000-0000-0000000b0000', 'teste.regra_b', 'Regra B', 'teste.evento', 'notificacao', '{"template_codigo":"teste.template","titulo":"Titulo de Teste"}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, status, attempt, max_attempts) values
  ('00000000-0000-0000-0000-0000004c0003', '00000000-0000-0000-0000-000000460002', '00000000-0000-0000-0000-0000000b0000', 'failed', 1, 1);

insert into public.failed_jobs (id, source_table, source_id, org_id, job_type, attempts, last_error) values
  ('00000000-0000-0000-0000-000000fd0004', 'automation_runs', '00000000-0000-0000-0000-0000004c0003', '00000000-0000-0000-0000-0000000b0000', 'automation_rule', 1, 'erro');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}', true);

-- 7. Admin da Org A bloqueado de reagendar um failed_job da Org B.
select throws_ok(
  $$ select public.retry_failed_job('00000000-0000-0000-0000-000000fd0004') $$,
  null,
  null,
  'admin da Org A não consegue reagendar um failed_job da Org B'
);

reset role;

select * from finish();
rollback;
