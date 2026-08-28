-- ============================================================
-- "Reservas sem Checkin" (devolução em atraso) — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- "Checkin" aqui = devolução do carro (fim do contrato) — confirmado
-- com o utilizador que é o oposto de "entrega"/checkout (início).
-- emit_reservas_sem_checkin_events() dispara quando data_fim já passou,
-- o contrato continua 'em_curso' e o evento de recolha/devolução/troca
-- ainda não tem realizado_em.
-- ============================================================

begin;
select plan(3);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000110000', 'Org Sem Checkin', 'sem-checkin-i');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000110001', 'admin@sem-checkin.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000110001', '00000000-0000-0000-0000-000000110000', true);

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-000000110010', '00000000-0000-0000-0000-000000110000', 'SC-00-HI', 'Opel', 'Corsa');

insert into public.clientes (id, org_id, codigo, nome) values
  ('00000000-0000-0000-0000-000000110020', '00000000-0000-0000-0000-000000110000', 991001, 'Cliente Teste I');

insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id) values
  ('00000000-0000-0000-0000-000000110030', '00000000-0000-0000-0000-000000110000', 991001, now() - interval '3 days',
   '00000000-0000-0000-0000-000000110010', '00000000-0000-0000-0000-000000110020');

-- Contrato A: data_fim há 1 dia, em_curso, sem checkin — deve disparar.
insert into public.contratos_renting (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim, tarifa_diaria, created_by)
values (
  '00000000-0000-0000-0000-000000110040', '00000000-0000-0000-0000-000000110000', 991001,
  '00000000-0000-0000-0000-000000110030', '00000000-0000-0000-0000-000000110020', '00000000-0000-0000-0000-000000110010',
  'SC-00-HI', now() - interval '3 days', now() - interval '1 day', 35, '00000000-0000-0000-0000-000000110001'
);
update public.contratos_renting set estado_operacional = 'em_curso' where id = '00000000-0000-0000-0000-000000110040';

select public.emit_reservas_sem_checkin_events();

-- 1. Contrato em atraso, sem checkin, publica o domain_event.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000110040' and event_type = 'contrato_renting.sem_checkin'),
  1,
  'contrato com devolução em atraso e sem checkin publica contrato_renting.sem_checkin'
);

-- Marca o evento de recolha como realizado (checkin feito) e corre o scan
-- outra vez — não deve publicar mais nada para este contrato.
update public.calendario_eventos
set realizado_em = now()
where origem_tipo = 'contrato_renting'
  and origem_id = '00000000-0000-0000-0000-000000110040'
  and tipo in ('recolha', 'devolucao', 'troca');

delete from public.domain_events where entity_id = '00000000-0000-0000-0000-000000110040' and event_type = 'contrato_renting.sem_checkin';

select public.emit_reservas_sem_checkin_events();

-- 2. Depois do checkin (realizado_em preenchido), deixa de disparar.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000110040' and event_type = 'contrato_renting.sem_checkin'),
  0,
  'depois do checkin (realizado_em preenchido) o contrato deixa de disparar'
);

-- Cenário B: pipeline completo notifica o admin quando ainda não há checkin.
insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id) values
  ('00000000-0000-0000-0000-000000110031', '00000000-0000-0000-0000-000000110000', 991002, now() - interval '3 days',
   '00000000-0000-0000-0000-000000110010', '00000000-0000-0000-0000-000000110020');

insert into public.contratos_renting (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim, tarifa_diaria, created_by)
values (
  '00000000-0000-0000-0000-000000110041', '00000000-0000-0000-0000-000000110000', 991002,
  '00000000-0000-0000-0000-000000110031', '00000000-0000-0000-0000-000000110020', '00000000-0000-0000-0000-000000110010',
  'SC-00-HI', now() - interval '3 days', now() - interval '1 day', 35, '00000000-0000-0000-0000-000000110001'
);
update public.contratos_renting set estado_operacional = 'em_curso' where id = '00000000-0000-0000-0000-000000110041';

select public.emit_reservas_sem_checkin_events();
select public.process_domain_events();
select public.execute_automation_runs();

-- 3. O admin recebe a notificação.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-000000110001' and template_codigo = 'contrato_renting.sem_checkin' and entity_id = '00000000-0000-0000-0000-000000110041'),
  1,
  'o admin recebe a notificação de devolução em atraso'
);

select * from finish();
rollback;
