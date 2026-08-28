-- ============================================================
-- "Contrato de Aluguer criado" — domain event + notificação (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- fn_contratos_renting_criado_domain_event() publica contrato_renting.criado
-- em domain_events sempre que nasce um contrato genuinamente novo
-- (contrato_anterior_id is null) — não dispara em renovações/edições que
-- criam uma nova versão da mesma linha.
-- ============================================================

begin;
select plan(3);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000060000', 'Org Contrato Criado', 'contrato-criado-g');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000060001', 'admin@contrato-criado.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000060001', '00000000-0000-0000-0000-000000060000', true);

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-000000060010', '00000000-0000-0000-0000-000000060000', 'GC-00-RI', 'Fiat', 'Punto');

insert into public.clientes (id, org_id, codigo, nome) values
  ('00000000-0000-0000-0000-000000060020', '00000000-0000-0000-0000-000000060000', 990001, 'Cliente Teste G');

insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id) values
  ('00000000-0000-0000-0000-000000060030', '00000000-0000-0000-0000-000000060000', 990001, now(),
   '00000000-0000-0000-0000-000000060010', '00000000-0000-0000-0000-000000060020');

-- Cenário A: contrato genuinamente novo (contrato_anterior_id null).
insert into public.contratos_renting (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, tarifa_diaria, created_by)
values (
  '00000000-0000-0000-0000-000000060040', '00000000-0000-0000-0000-000000060000', 990001,
  '00000000-0000-0000-0000-000000060030', '00000000-0000-0000-0000-000000060020', '00000000-0000-0000-0000-000000060010',
  'GC-00-RI', now(), 35, '00000000-0000-0000-0000-000000060001'
);

-- 1. Contrato novo publica o domain_event.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000060040' and event_type = 'contrato_renting.criado'),
  1,
  'um contrato genuinamente novo publica contrato_renting.criado'
);

select public.process_domain_events();
select public.execute_automation_runs();

-- 2. O pipeline completo chega a criar a notificação para o admin.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-000000060001' and template_codigo = 'contrato_renting.criado'),
  1,
  'o admin recebe a notificação de novo contrato'
);

-- Cenário B: "renovação"/nova versão (contrato_anterior_id preenchido) —
-- não deve publicar um novo domain_event de "criado".
insert into public.contratos_renting (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, tarifa_diaria, created_by, contrato_anterior_id, versao)
values (
  '00000000-0000-0000-0000-000000060041', '00000000-0000-0000-0000-000000060000', 990002,
  '00000000-0000-0000-0000-000000060030', '00000000-0000-0000-0000-000000060020', '00000000-0000-0000-0000-000000060010',
  'GC-00-RI', now(), 35, '00000000-0000-0000-0000-000000060001',
  '00000000-0000-0000-0000-000000060040', 2
);

-- 3. Nova versão de um contrato existente NÃO publica contrato_renting.criado.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000060041' and event_type = 'contrato_renting.criado'),
  0,
  'uma renovação/nova versão (contrato_anterior_id preenchido) não publica contrato_renting.criado'
);

select * from finish();
rollback;
