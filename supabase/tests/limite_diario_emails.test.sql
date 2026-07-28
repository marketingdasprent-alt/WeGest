-- ============================================================
-- Limite diário de emails por organização
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Incidente real: 1764 emails/dia para 21 pessoas. notification_queue_claim()
-- agora recusa-se a marcar mais de N emails 'running' por org por dia civil
-- (canal='email'); o excedente fica 'pending' e é retomado no dia seguinte.
-- Na primeira vez que o limite é atingido num dia, os admins da org recebem
-- um único aviso interno.
-- ============================================================

begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000i0000', 'Org Limite Email', 'limite-email-i');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000i0a01', 'admin@limite-email.pt'),
  ('00000000-0000-0000-0000-0000000i0a02', 'destino@limite-email.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000i0a01', '00000000-0000-0000-0000-0000000i0000', true);

-- 300 emails já "sent" HOJE (simula o limite diário já atingido) + 1 pending
-- por enfileirar. notification_id só existe para satisfazer a FK — não é o
-- foco deste teste, por isso aponta todos para o mesmo registo dummy.
insert into public.notifications (id, org_id, destinatario_user_id, template_codigo, titulo, payload) values
  ('00000000-0000-0000-0000-000000ni0001', '00000000-0000-0000-0000-0000000i0000', '00000000-0000-0000-0000-0000000i0a02', 'teste.limite', 'Aviso', '{}'::jsonb);

insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, status, created_at)
select
  '00000000-0000-0000-0000-000000ni0001',
  '00000000-0000-0000-0000-0000000i0000',
  'email',
  'destino@limite-email.pt',
  'teste.limite',
  'sent',
  now()
from generate_series(1, 300);

insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, status, created_at)
values (
  '00000000-0000-0000-0000-000000ni0001', '00000000-0000-0000-0000-0000000i0000',
  'email', 'destino@limite-email.pt', 'teste.limite', 'pending', now()
);

-- Um email de ONTEM sent não deve contar para o limite de hoje.
insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, status, created_at)
values (
  '00000000-0000-0000-0000-000000ni0001', '00000000-0000-0000-0000-0000000i0000',
  'email', 'destino@limite-email.pt', 'teste.limite', 'sent', now() - interval '1 day'
);

-- 1. O email pending de hoje NÃO é reclamado — já há 300 sent hoje.
select is(
  (select count(*)::int from public.notification_queue_claim('email', 10)),
  0,
  'notification_queue_claim() não reclama emails além do limite diário por org'
);

select is(
  (select status from public.notification_queue where notification_id = '00000000-0000-0000-0000-000000ni0001' and status = 'pending'),
  'pending',
  'o email excedente fica pending (não se perde, só atrasa)'
);

-- 2. O admin recebe UM aviso interno (notifications + notificacoes) na primeira vez.
select is(
  (select count(*)::int from public.notifications where org_id = '00000000-0000-0000-0000-0000000i0000' and destinatario_user_id = '00000000-0000-0000-0000-0000000i0a01' and template_codigo = 'sistema.limite_email_atingido'),
  1,
  'admin recebe um aviso interno quando o limite diário é atingido'
);

select is(
  (select count(*)::int from public.notificacoes where destinatario_id = '00000000-0000-0000-0000-0000000i0a01' and tipo = 'sistema_limite_email_atingido'),
  1,
  'o aviso também aparece na bell (dupla escrita na tabela legada)'
);

-- 3. Correr outra vez no mesmo dia não duplica o aviso.
select public.notification_queue_claim('email', 10);

select is(
  (select count(*)::int from public.notifications where org_id = '00000000-0000-0000-0000-0000000i0000' and template_codigo = 'sistema.limite_email_atingido'),
  1,
  'correr notification_queue_claim outra vez no mesmo dia não duplica o aviso'
);

-- 4. Um email de outra org, sem histórico de hoje, continua a ser reclamado normalmente.
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000i0001', 'Org Sem Limite', 'sem-limite-i');

insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, status, created_at)
values (
  '00000000-0000-0000-0000-000000ni0001', '00000000-0000-0000-0000-0000000i0001',
  'email', 'outra@org.pt', 'teste.limite', 'pending', now()
);

select is(
  (select count(*)::int from public.notification_queue_claim('email', 10)),
  1,
  'uma org sem histórico de hoje continua a enviar normalmente (limite é por org)'
);

select * from finish();
rollback;
