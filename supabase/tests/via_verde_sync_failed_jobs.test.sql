-- ============================================================
-- "Alerta de falha de sincronização Via Verde" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Item 12/13 da lista do chefe. A integração Via Verde já existe por
-- completo; só faltava avisar alguém quando via_verde_sync_queue.status
-- passa a 'failed'. Reutiliza 100% o mecanismo do item 1
-- (failed_jobs + handle_failed_job_notify()) — só um trigger novo que
-- alimenta failed_jobs a partir da fila Via Verde, sem tocar no motor
-- de regras/cargo (mesmo alerta técnico direto aos admins).
-- ============================================================

begin;
select plan(3);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000150000', 'Org ViaVerde J', 'vv-j0');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000150001', 'admin@vv-j0.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000150001', '00000000-0000-0000-0000-000000150000', true);

insert into public.plataformas_configuracao (id, org_id, plataforma, sync_automatico) values
  ('00000000-0000-0000-0000-000000150010', '00000000-0000-0000-0000-000000150000', 'via_verde', true);

-- Fila A: transição running -> failed, deve alimentar failed_jobs.
insert into public.via_verde_sync_queue (id, integracao_id, org_id, periodo_inicio, periodo_fim, status) values
  ('00000000-0000-0000-0000-000000150020', '00000000-0000-0000-0000-000000150010', '00000000-0000-0000-0000-000000150000', current_date - 7, current_date, 'running');

update public.via_verde_sync_queue
set status = 'failed', error_message = 'Timeout ao contactar o robot Apify'
where id = '00000000-0000-0000-0000-000000150020';

-- 1. Transição para 'failed' cria uma linha em failed_jobs.
select is(
  (select count(*)::int from public.failed_jobs where source_table = 'via_verde_sync_queue' and source_id = '00000000-0000-0000-0000-000000150020'),
  1,
  'transição running->failed alimenta failed_jobs'
);

-- Fila B: transição running -> completed, NÃO deve alimentar failed_jobs.
insert into public.via_verde_sync_queue (id, integracao_id, org_id, periodo_inicio, periodo_fim, status) values
  ('00000000-0000-0000-0000-000000150021', '00000000-0000-0000-0000-000000150010', '00000000-0000-0000-0000-000000150000', current_date - 7, current_date, 'running');

update public.via_verde_sync_queue set status = 'completed' where id = '00000000-0000-0000-0000-000000150021';

-- 2. Transição para 'completed' não dispara nada.
select is(
  (select count(*)::int from public.failed_jobs where source_id = '00000000-0000-0000-0000-000000150021'),
  0,
  'transição running->completed não alimenta failed_jobs'
);

select public.process_domain_events();
select public.execute_automation_runs();

-- 3. O admin da org recebe a notificação técnica via o mecanismo já existente do item 1.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-000000150001' and template_codigo = 'sistema.job_falhou'),
  1,
  'admin da org recebe a notificação técnica reaproveitando o item 1'
);

select * from finish();
rollback;
