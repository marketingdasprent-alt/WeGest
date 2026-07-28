-- ============================================================
-- "Notificação ao motorista quando uma reparação fecha com valor a cobrar" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Item 8/13 da lista do chefe. Dispara via trigger AFTER INSERT em
-- motorista_financeiro quando categoria='reparacao' e tipo='debito' —
-- o momento em que useTicketClosure.ts confirma a cobrança ao motorista.
-- Destinatário é o próprio motorista (destinatarios_estrategia='motorista'),
-- não um cargo: notificação in-app só se tiver conta no portal
-- (motoristas_ativos.user_id), email sempre para motoristas_ativos.email.
-- ============================================================

begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000c0000', 'Org Reparacao C', 'rep-c0');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0001', 'admin@rep-c0.pt'),
  ('00000000-0000-0000-0000-0000000c0002', 'driver.portal@rep-c0.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000c0000', true);

-- Motorista A: tem conta no portal.
insert into public.motoristas_ativos (id, nome, org_id, user_id, email) values
  ('00000000-0000-0000-0000-0000000c0010', 'Motorista Com Portal', '00000000-0000-0000-0000-0000000c0000',
   '00000000-0000-0000-0000-0000000c0002', 'driver.portal@rep-c0.pt');

-- Motorista B: sem conta no portal (só email).
insert into public.motoristas_ativos (id, nome, org_id, user_id, email) values
  ('00000000-0000-0000-0000-0000000c0011', 'Motorista Sem Portal', '00000000-0000-0000-0000-0000000c0000',
   null, 'driver.semportal@rep-c0.pt');

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-0000000c0020', '00000000-0000-0000-0000-0000000c0000', 'RC-00-CA', 'Fiat', 'Punto');

insert into public.viatura_reparacoes (id, viatura_id, descricao, custo, motorista_responsavel_id, cobrar_motorista, valor_a_cobrar, status_financeiro, org_id) values
  ('00000000-0000-0000-0000-0000000c0030', '00000000-0000-0000-0000-0000000c0020', 'Substituição de para-choques', 250, '00000000-0000-0000-0000-0000000c0010', true, 250, 'motorista', '00000000-0000-0000-0000-0000000c0000'),
  ('00000000-0000-0000-0000-0000000c0031', '00000000-0000-0000-0000-0000000c0020', 'Troca de pneus', 180, '00000000-0000-0000-0000-0000000c0011', true, 180, 'motorista', '00000000-0000-0000-0000-0000000c0000');

-- Caso 1: cobrança ao motorista com conta no portal.
insert into public.motorista_financeiro (id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, reparacao_id, referencia) values
  ('00000000-0000-0000-0000-0000000c0040', '00000000-0000-0000-0000-0000000c0010', 'debito', 'reparacao',
   'Reparação Viatura: RC-00-CA - Substituição de para-choques', 250, current_date, 'pendente',
   '00000000-0000-0000-0000-0000000c0030', 'Ticket #1');

-- Caso 2: cobrança ao motorista sem conta no portal.
insert into public.motorista_financeiro (id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, reparacao_id, referencia) values
  ('00000000-0000-0000-0000-0000000c0041', '00000000-0000-0000-0000-0000000c0011', 'debito', 'reparacao',
   'Reparação Viatura: RC-00-CA - Troca de pneus', 180, current_date, 'pendente',
   '00000000-0000-0000-0000-0000000c0031', 'Ticket #2');

-- Caso 3 (negativo): lançamento financeiro que NÃO é reparação (multa) não deve disparar nada.
insert into public.motorista_financeiro (id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
  ('00000000-0000-0000-0000-0000000c0042', '00000000-0000-0000-0000-0000000c0010', 'debito', 'multa', 'Multa de trânsito', 50, current_date, 'pendente');

-- 1. Caso 1 publica o domain_event.
select is(
  (select count(*)::int from public.domain_events where entity_table = 'motorista_financeiro' and entity_id = '00000000-0000-0000-0000-0000000c0040' and event_type = 'motorista.reparacao_cobranca'),
  1,
  'débito de reparação para motorista com portal publica motorista.reparacao_cobranca'
);

-- 2. Caso 2 publica o domain_event.
select is(
  (select count(*)::int from public.domain_events where entity_table = 'motorista_financeiro' and entity_id = '00000000-0000-0000-0000-0000000c0041' and event_type = 'motorista.reparacao_cobranca'),
  1,
  'débito de reparação para motorista sem portal publica motorista.reparacao_cobranca'
);

-- 3. Caso 3 (multa) não dispara nada.
select is(
  (select count(*)::int from public.domain_events where entity_table = 'motorista_financeiro' and entity_id = '00000000-0000-0000-0000-0000000c0042'),
  0,
  'lançamento de multa (categoria != reparacao) não dispara o alerta'
);

select public.process_domain_events();
select public.execute_automation_runs();

-- 4. Motorista com portal recebe notificação in-app.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-0000000c0002' and template_codigo = 'motorista.reparacao_cobranca'),
  1,
  'motorista com conta no portal recebe notificação in-app'
);

-- 5. Motorista com portal recebe também email na fila.
select is(
  (select count(*)::int from public.notification_queue where destinatario = 'driver.portal@rep-c0.pt' and template_codigo = 'motorista.reparacao_cobranca'),
  1,
  'motorista com conta no portal recebe email na fila'
);

-- 6. Motorista sem portal recebe email na fila (sem notificação in-app possível).
select is(
  (select count(*)::int from public.notification_queue where destinatario = 'driver.semportal@rep-c0.pt' and template_codigo = 'motorista.reparacao_cobranca'),
  1,
  'motorista sem conta no portal recebe email na fila para o endereço da ficha'
);

select * from finish();
rollback;
