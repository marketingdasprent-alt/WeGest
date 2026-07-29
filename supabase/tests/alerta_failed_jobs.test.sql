-- ============================================================
-- Motor genérico de alerta em falha de jobs agendados (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- failed_jobs (motor de automação + fila de notificações) já existia,
-- mas ninguém era avisado — o admin tinha de ir espreitar o ecrã.
-- Trigger on_failed_job_notify() avisa os admins da org por cada
-- INSERT em failed_jobs, com email ativado por omissão (é uma falha
-- técnica, não deve passar despercebida).
-- ============================================================

begin;
select plan(5);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0000', 'Org Failed Jobs', 'failed-jobs-f');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001', 'admin@failed-jobs.pt'),
  ('00000000-0000-0000-0000-0000000f0002', 'nao-admin@failed-jobs.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000f0000', true),
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0000', false);

insert into public.failed_jobs (source_table, source_id, org_id, job_type, payload, attempts, last_error)
values (
  'automation_runs', '00000000-0000-0000-0000-0000000f0099', '00000000-0000-0000-0000-0000000f0000',
  'teste.job', '{}'::jsonb, 3, 'erro de teste'
);

-- 1. O admin recebe uma notificação (bell).
select is(
  (select count(*)::int from public.notifications where org_id = '00000000-0000-0000-0000-0000000f0000' and destinatario_user_id = '00000000-0000-0000-0000-0000000f0001'),
  1,
  'o admin recebe uma notificação quando um failed_job é criado'
);

-- 2. ...com o template_codigo certo e o erro na mensagem.
select is(
  (select mensagem from public.notifications where org_id = '00000000-0000-0000-0000-0000000f0000' and destinatario_user_id = '00000000-0000-0000-0000-0000000f0001'),
  'erro de teste',
  'a mensagem da notificação inclui o last_error do failed_job'
);

-- 3. O não-admin NÃO recebe nada (só admins são avisados).
select is(
  (select count(*)::int from public.notifications where org_id = '00000000-0000-0000-0000-0000000f0000' and destinatario_user_id = '00000000-0000-0000-0000-0000000f0002'),
  0,
  'utilizador não-admin não recebe o alerta'
);

-- 4. Fica também espelhado na tabela legada (para a bell antiga).
select is(
  (select count(*)::int from public.notificacoes where org_id = '00000000-0000-0000-0000-0000000f0000' and tipo = 'sistema_job_falhou' and destinatario_id = '00000000-0000-0000-0000-0000000f0001'),
  1,
  'a notificação legada (notificacoes) também é criada'
);

-- 5. Email ativado por omissão (ao contrário dos avisos de negócio normais).
select is(
  (select count(*)::int from public.notification_queue where org_id = '00000000-0000-0000-0000-0000000f0000' and canal = 'email' and destinatario = 'admin@failed-jobs.pt'),
  1,
  'um email é enfileirado automaticamente para o admin'
);

select * from finish();
rollback;
