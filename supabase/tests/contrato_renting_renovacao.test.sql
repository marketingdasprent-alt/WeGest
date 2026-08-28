-- ============================================================
-- Motor de Automação — Renovação proativa de contrato_renting (C2)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- O RenovacoesBanner já classifica contratos "hoje"/"em atraso" para
-- renovar (src/lib/renovacaoContrato.ts) — mas só aparece se o gestor abrir
-- a página de contratos de renting. Este ficheiro cobre o emissor que
-- replica a MESMA regra em SQL (reaproveitando a função já existente
-- public.proxima_data_renovacao(), a mesma usada por renovar_contrato_renting)
-- e o fecho ponta-a-ponta via o motor de automação.
-- ============================================================

begin;
select plan(8);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000e0000', 'Org Renovacao', 'renovacao-e');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-0000000e0000', 'Cliente Renovação Teste');

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-00000081e0e1', '00000000-0000-0000-0000-0000000e0000', 'RR-11-RR', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-00000082e0e2', '00000000-0000-0000-0000-0000000e0000', 'RR-22-RR', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-00000083e0e3', '00000000-0000-0000-0000-0000000e0000', 'RR-33-RR', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-00000084e0e4', '00000000-0000-0000-0000-0000000e0000', 'RR-44-RR', 'Toyota', 'Corolla');

-- C1: rent_a_car, data_fim ontem, em_curso, longa duração — deve emitir.
insert into public.contratos_renting (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim, estado_operacional, regime, is_longa_duracao) values
  ('00000000-0000-0000-0000-000000c71e01', '00000000-0000-0000-0000-0000000e0000', '00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-00000081e0e1', 'RR-11-RR', now() - interval '60 days', now() - interval '1 day', 'em_curso', 'rent_a_car', true);

-- C2: rent_a_car, data_fim daqui a 100 dias — NÃO deve emitir (ainda não chegou o prazo).
insert into public.contratos_renting (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim, estado_operacional, regime, is_longa_duracao) values
  ('00000000-0000-0000-0000-000000c72e02', '00000000-0000-0000-0000-0000000e0000', '00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-00000082e0e2', 'RR-22-RR', now() - interval '10 days', now() + interval '100 days', 'em_curso', 'rent_a_car', true);

-- C3: data_fim ontem MAS já substituído (renovado) — NÃO deve emitir.
insert into public.contratos_renting (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim, estado_operacional, regime, is_longa_duracao, substituido_em) values
  ('00000000-0000-0000-0000-000000c73e03', '00000000-0000-0000-0000-0000000e0000', '00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-00000083e0e3', 'RR-33-RR', now() - interval '60 days', now() - interval '1 day', 'em_curso', 'rent_a_car', true, now());

-- C4: TVDE aberto (data_fim NULL), início há 40 dias, sem opção/intervalo
-- definidos (default 30 dias) — prazo calculado cai há 10 dias — deve emitir.
insert into public.contratos_renting (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim, estado_operacional, regime, is_longa_duracao) values
  ('00000000-0000-0000-0000-000000c74e04', '00000000-0000-0000-0000-0000000e0000', '00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-00000084e0e4', 'RR-44-RR', now() - interval '40 days', null, 'em_curso', 'tvde', true);

select public.seed_automacao_defaults('00000000-0000-0000-0000-0000000e0000');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e0a01', 'gestor@renovacao-e.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0000', true);

select public.emit_contrato_renting_renovacao_events();

-- 1. C1 (rent_a_car, prazo já passado) emite o evento.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000c71e01' and event_type = 'contrato_renting.renovacao_proxima'),
  1,
  'contrato rent_a_car com data_fim já passada emite contrato_renting.renovacao_proxima'
);

-- 2. C2 (prazo no futuro) não emite.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000c72e02' and event_type = 'contrato_renting.renovacao_proxima'),
  0,
  'contrato com data_fim no futuro não emite'
);

-- 3. C3 (já substituído) não emite, mesmo com data_fim passada.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000c73e03' and event_type = 'contrato_renting.renovacao_proxima'),
  0,
  'contrato já substituído (renovado) não emite outra vez'
);

-- 4. C4 (TVDE aberto) emite, com o prazo calculado por proxima_data_renovacao()
--    (mesma função usada por renovar_contrato_renting) igual ao payload do evento.
select is(
  (select (payload->>'prazo')::date from public.domain_events where entity_id = '00000000-0000-0000-0000-000000c74e04' and event_type = 'contrato_renting.renovacao_proxima'),
  (select public.proxima_data_renovacao(c.data_inicio, c.renovacao_opcao::text, c.renovacao_intervalo_dias)::date from public.contratos_renting c where c.id = '00000000-0000-0000-0000-000000c74e04'),
  'contrato TVDE aberto emite com o prazo calculado por proxima_data_renovacao()'
);

-- 5. Correr o scan outra vez não duplica o evento de C1 (ainda não processado).
select public.emit_contrato_renting_renovacao_events();

select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000c71e01' and event_type = 'contrato_renting.renovacao_proxima'),
  1,
  'correr o scan outra vez não duplica um evento ainda não processado'
);

-- 6/7. Ponta-a-ponta: o gestor recebe notificação interna + fica em fila de
-- email (a auditoria pede "Notificação interna" + "Email" para C2).
select public.process_domain_events();
select public.execute_automation_runs();

select is(
  (
    select count(*)::int from public.notifications n
    join public.automation_runs r on r.id = n.rule_run_id
    where n.destinatario_user_id = '00000000-0000-0000-0000-0000000e0a01'
      and r.entity_id = '00000000-0000-0000-0000-000000c71e01'
  ),
  1,
  'ponta-a-ponta: gestor recebe notificação interna sobre o contrato C1 a renovar'
);

select is(
  (
    select count(*)::int from public.notification_queue nq
    join public.notifications n on n.id = nq.notification_id
    join public.automation_runs r on r.id = n.rule_run_id
    where nq.canal = 'email'
      and nq.template_codigo = 'contrato_renting.renovacao_proxima'
      and r.entity_id = '00000000-0000-0000-0000-000000c71e01'
  ),
  1,
  'ponta-a-ponta: fica também em fila de email (canal Email pedido pela auditoria)'
);

-- 8. Existe um template de email para este código.
select is(
  (select count(*)::int from public.notification_templates where org_id = '00000000-0000-0000-0000-0000000e0000' and codigo = 'contrato_renting.renovacao_proxima' and canal = 'email' and ativo = true),
  1,
  'seed_automacao_defaults() cria o template de email de renovacao_proxima'
);

select * from finish();
rollback;
