-- ============================================================
-- Motor de Automação — notification_queue (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre a fila de entrega multi-canal: claim atómico por canal, retry
-- com backoff exponencial, dead-letter em failed_jobs (partilhado com
-- automation_runs) ao esgotar tentativas.
-- ============================================================

begin;
select plan(10);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org A', 'notif-queue-a');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0001', 'a1@notif-queue.pt');

insert into public.notifications (id, org_id, destinatario_user_id, template_codigo, titulo) values
  ('00000000-0000-0000-0000-000000f1e001', '00000000-0000-0000-0000-0000000a0000', '00000000-0000-0000-0000-0000000a0001', 'teste.notif', 'Notificação de Teste');

insert into public.notification_queue (id, notification_id, org_id, canal, destinatario, template_codigo, max_attempts) values
  ('00000000-0000-0000-0000-00000091e001', '00000000-0000-0000-0000-000000f1e001', '00000000-0000-0000-0000-0000000a0000', 'email', 'a1@notif-queue.pt', 'teste.notif', 2);

-- 1. claim() por canal devolve o item pendente do canal certo.
select is(
  (select count(*)::int from public.notification_queue_claim('email', 10)),
  1,
  'claim() devolve o item pendente do canal pedido'
);

-- 2. claim() marca running.
select is(
  (select status from public.notification_queue where id = '00000000-0000-0000-0000-00000091e001'),
  'running',
  'claim() marca o item como running'
);

-- 3. claim() do MESMO canal não devolve outra vez.
select is(
  (select count(*)::int from public.notification_queue_claim('email', 10)),
  0,
  'claim() não devolve o mesmo item duas vezes seguidas'
);

-- 4. claim() de outro canal não devolve nada (filtra por canal).
select is(
  (select count(*)::int from public.notification_queue_claim('whatsapp', 10)),
  0,
  'claim() filtra por canal — não devolve itens de outro canal'
);

-- 5. Falha com tentativas restantes volta a pending.
select public.notification_queue_fail('00000000-0000-0000-0000-00000091e001', 'erro smtp 1');

select is(
  (select status from public.notification_queue where id = '00000000-0000-0000-0000-00000091e001'),
  'pending',
  'falha com tentativas restantes volta a pending'
);

-- 6. ...com backoff no futuro.
select ok(
  (select next_attempt_at > now() from public.notification_queue where id = '00000000-0000-0000-0000-00000091e001'),
  'falha agenda o próximo attempt no futuro'
);

-- 7. Esgotar tentativas (max_attempts=2): dead-letter.
update public.notification_queue set next_attempt_at = now() where id = '00000000-0000-0000-0000-00000091e001';
select public.notification_queue_claim('email', 10);
select public.notification_queue_fail('00000000-0000-0000-0000-00000091e001', 'erro smtp 2');

select is(
  (select status from public.notification_queue where id = '00000000-0000-0000-0000-00000091e001'),
  'failed',
  'segunda falha esgota max_attempts e fica failed'
);

-- 8. Dead-letter grava em failed_jobs (partilhado com automation_runs).
select is(
  (select count(*)::int from public.failed_jobs where source_table = 'notification_queue' and source_id = '00000000-0000-0000-0000-00000091e001'),
  1,
  'esgotar tentativas grava uma linha em failed_jobs'
);

-- 9/10. Caminho feliz: outro item, claim() + complete() marca sent.
insert into public.notification_queue (id, notification_id, org_id, canal, destinatario, template_codigo) values
  ('00000000-0000-0000-0000-00000092e001', '00000000-0000-0000-0000-000000f1e001', '00000000-0000-0000-0000-0000000a0000', 'email', 'a1@notif-queue.pt', 'teste.notif');

select public.notification_queue_claim('email', 10);
select public.notification_queue_complete('00000000-0000-0000-0000-00000092e001');

select is(
  (select status from public.notification_queue where id = '00000000-0000-0000-0000-00000092e001'),
  'sent',
  'complete() marca o item como sent'
);

select is(
  (select count(*)::int from public.notification_queue_claim('email', 10)),
  0,
  'um item já sent não volta a ser reclamado'
);

select * from finish();
rollback;
