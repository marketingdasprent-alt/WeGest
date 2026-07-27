-- ============================================================
-- Motor de Automação — Aviso de criação de novo utilizador (L2)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Hoje create-user (e o signup normal) criam um utilizador sem avisar mais
-- ninguém na organização além de quem executou a ação. Este ficheiro cobre
-- a extensão de handle_new_user_org() para emitir um domain_event
-- 'utilizador.criado' — só para STAFF ('colaborador'), nunca para
-- motoristas (o self-signup de motoristas é rotina, não uma operação
-- sensível de gestão de acessos) — e o fecho ponta-a-ponta via o motor de
-- automação já existente.
-- ============================================================

begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000d0000', 'Org Novo Utilizador', 'novo-utilizador-d');

-- Admin existente da org — deve ser avisado quando outro colaborador é criado.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d0001', 'admin@novo-utilizador-d.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0000', true);

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0000');

select public.seed_automacao_defaults('00000000-0000-0000-0000-0000000d0000');

-- 1. A regra utilizador.criado passa a existir, só notificação interna
--    (canal email fica false — o L2 da auditoria só pede "Notificação interna").
select is(
  (
    select (acao_config->>'enviar_email')::boolean from public.automation_rules
    where org_id = '00000000-0000-0000-0000-0000000d0000' and event_type = 'utilizador.criado'
  ),
  false,
  'utilizador.criado é seedada como notificação interna apenas, sem email'
);

-- 2. Criar um COLABORADOR (staff) emite o evento, com nome e email no payload.
insert into auth.users (id, email, raw_user_meta_data) values
  (
    '00000000-0000-0000-0000-0000000d0002', 'novo.colaborador@novo-utilizador-d.pt',
    jsonb_build_object('nome', 'Novo Colaborador', 'org_id', '00000000-0000-0000-0000-0000000d0000')
  );

select is(
  (
    select payload from public.domain_events
    where entity_id = '00000000-0000-0000-0000-0000000d0002' and event_type = 'utilizador.criado'
  ),
  jsonb_build_object('nome', 'Novo Colaborador', 'email', 'novo.colaborador@novo-utilizador-d.pt'),
  'criar um colaborador emite utilizador.criado com nome e email'
);

-- 3. Criar um MOTORISTA (self-signup de condução) NÃO emite este evento —
--    é rotina, não uma operação de gestão de acessos sensível.
insert into auth.users (id, email, raw_user_meta_data) values
  (
    '00000000-0000-0000-0000-0000000d0003', 'novo.motorista@novo-utilizador-d.pt',
    jsonb_build_object('cargo_nome', 'Motorista', 'org_id', '00000000-0000-0000-0000-0000000d0000')
  );

select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000d0003' and event_type = 'utilizador.criado'),
  0,
  'criar um motorista não emite utilizador.criado'
);

-- 4. Ponta-a-ponta: o admin existente recebe uma notificação interna sobre
--    o novo colaborador criado no passo 2.
select public.process_domain_events();
select public.execute_automation_runs();

select is(
  (
    select count(*)::int from public.notifications n
    join public.automation_runs r on r.id = n.rule_run_id
    join public.domain_events e on e.id = r.trigger_event_id
    where n.destinatario_user_id = '00000000-0000-0000-0000-0000000d0001'
      and e.entity_id = '00000000-0000-0000-0000-0000000d0002'
  ),
  1,
  'o admin existente da org recebe notificação sobre o novo colaborador'
);

-- 5. Nenhuma notificação equivalente foi gerada para a criação do motorista.
select is(
  (
    select count(*)::int from public.notifications n
    join public.automation_runs r on r.id = n.rule_run_id
    join public.domain_events e on e.id = r.trigger_event_id
    where e.entity_id = '00000000-0000-0000-0000-0000000d0003'
  ),
  0,
  'a criação do motorista não gera notificação equivalente'
);

-- 6. seed_automacao_defaults() continua idempotente com a nova regra incluída.
select public.seed_automacao_defaults('00000000-0000-0000-0000-0000000d0000');

select is(
  (select count(*)::int from public.automation_rules where org_id = '00000000-0000-0000-0000-0000000d0000' and event_type = 'utilizador.criado'),
  1,
  'chamar seed_automacao_defaults() outra vez não duplica a regra utilizador.criado'
);

select * from finish();
rollback;
