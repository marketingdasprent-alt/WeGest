-- ============================================================
-- testar_regra_automacao() (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre: permissão, regra de outra organização, acao_tipo inválido, sem
-- execução anterior, notificação de teste dirigida ao próprio testador
-- (nunca aos destinatários reais), email só quando acao_tipo = 'email',
-- cooldown de 30s, e a lista de "quem receberia a sério".
-- ============================================================

begin;
select plan(11);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000080000', 'Org Testar Regra', 'testar-regra-g');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000080a01', 'admin@testar-regra-g.pt'),
  ('00000000-0000-0000-0000-000000080a02', 'sem-permissao@testar-regra-g.pt'),
  ('00000000-0000-0000-0000-000000080a03', 'gestor@testar-regra-g.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000080a01', '00000000-0000-0000-0000-000000080000', true),
  ('00000000-0000-0000-0000-000000080a02', '00000000-0000-0000-0000-000000080000', false),
  ('00000000-0000-0000-0000-000000080a03', '00000000-0000-0000-0000-000000080000', false);

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-000000080a01', '00000000-0000-0000-0000-000000080000'),
  ('00000000-0000-0000-0000-000000080a02', '00000000-0000-0000-0000-000000080000'),
  ('00000000-0000-0000-0000-000000080a03', '00000000-0000-0000-0000-000000080000');

-- Regra de notificação, sem execução ainda.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values (
  '00000000-0000-0000-0000-000000080b01', '00000000-0000-0000-0000-000000080000',
  'zz.teste.pgtap.testar.notif', 'Notificação de teste', 'viatura.seguro_expirando', 'notificacao',
  jsonb_build_object('template_codigo', 'zz-teste', 'titulo', 'Seguro a expirar', 'destinatarios_cargo_ids', jsonb_build_array())
);

-- Regra automacao_interna — usada só para o teste do guarda de acao_tipo.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values (
  '00000000-0000-0000-0000-000000080b02', '00000000-0000-0000-0000-000000080000',
  'zz.teste.pgtap.testar.interna', 'Acção interna de teste', 'assistencia_ticket.aberto_demasiado_tempo', 'automacao_interna',
  jsonb_build_object('accao', 'ticket.alterar_estado', 'valor', 'resolvido')
);

-- Regra de outra organização — usada só para o teste de isolamento.
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000080ffe', 'Org Alheia', 'testar-regra-alheia');
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values (
  '00000000-0000-0000-0000-000000080b03', '00000000-0000-0000-0000-000000080ffe',
  'zz.teste.pgtap.testar.alheia', 'Regra de outra org', 'viatura.seguro_expirando', 'notificacao',
  jsonb_build_object('template_codigo', 'zz-teste', 'titulo', 'Alheia', 'destinatarios_cargo_ids', jsonb_build_array())
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a01","role":"authenticated"}', true);

-- 1. Sem execução anterior — a regra de notificação nunca correu.
select throws_ok(
  $$ select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b01') $$,
  'P0001',
  'Esta automação ainda não correu — não há dados para testar.',
  'sem automation_runs anterior, o teste é recusado'
);

reset role;

-- Dá à regra de notificação um "último payload" real.
insert into public.automation_runs (id, org_id, rule_id, event_type, entity_table, entity_id, payload, status, rule_snapshot) values (
  '00000000-0000-0000-0000-000000080c01', '00000000-0000-0000-0000-000000080000',
  '00000000-0000-0000-0000-000000080b01', 'viatura.seguro_expirando', 'viaturas',
  '00000000-0000-0000-0000-000000080d01', jsonb_build_object('matricula', 'ZZ-00-ZZ'), 'completed',
  jsonb_build_object('regra', to_jsonb((select r from public.automation_rules r where r.id = '00000000-0000-0000-0000-000000080b01')))
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a02', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a02","role":"authenticated"}', true);

-- 2. Utilizador sem permissão não consegue testar.
select throws_ok(
  $$ select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b01') $$,
  'P0001',
  'Sem permissão para testar automações.',
  'utilizador sem admin/can_edit(automacoes) não pode testar'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a01","role":"authenticated"}', true);

-- 3. Regra de outra organização — não encontrada.
select throws_ok(
  $$ select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b03') $$,
  'P0001',
  'Regra não encontrada.',
  'regra de outra organização não é visível para testar'
);

-- 4. acao_tipo = 'automacao_interna' é recusado.
select throws_ok(
  $$ select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b02') $$,
  'P0001',
  'Só é possível testar acções de notificação ou email.',
  'acção interna não pode ser testada por este caminho'
);

-- 5. Admin consegue testar a regra de notificação — devolve notificacao_id.
select isnt(
  (select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b01')->>'notificacao_id'),
  null,
  'testar uma regra de notificação devolve o id da notificação criada'
);

-- 6. A notificação de teste foi para o próprio admin, nunca para outro
--    utilizador, e sem rule_run_id (fora do ciclo real).
select is(
  (select destinatario_user_id from public.notifications where titulo like '[Teste]%' and org_id = '00000000-0000-0000-0000-000000080000' order by created_at desc limit 1),
  '00000000-0000-0000-0000-000000080a01'::uuid,
  'a notificação de teste é dirigida a quem testou'
);

select ok(
  (select rule_run_id is null from public.notifications where titulo like '[Teste]%' order by created_at desc limit 1),
  'a notificação de teste não fica ligada a nenhum run real'
);

-- 7. acao_tipo = 'notificacao' não gera linha em notification_queue.
select is(
  (select count(*)::int from public.notification_queue nq
     join public.notifications n on n.id = nq.notification_id
     where n.titulo like '[Teste]%'),
  0,
  'testar uma regra de notificação não envia email nenhum'
);

reset role;

-- Regra de email, com o mesmo último payload.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values (
  '00000000-0000-0000-0000-000000080b04', '00000000-0000-0000-0000-000000080000',
  'zz.teste.pgtap.testar.email', 'Email de teste', 'viatura.seguro_expirando', 'email',
  jsonb_build_object('template_codigo', 'zz-teste-email', 'titulo', 'Seguro a expirar (email)')
);

insert into public.automation_runs (id, org_id, rule_id, event_type, entity_table, entity_id, payload, status, rule_snapshot) values (
  '00000000-0000-0000-0000-000000080c02', '00000000-0000-0000-0000-000000080000',
  '00000000-0000-0000-0000-000000080b04', 'viatura.seguro_expirando', 'viaturas',
  '00000000-0000-0000-0000-000000080d01', jsonb_build_object('matricula', 'ZZ-00-ZZ'), 'completed',
  jsonb_build_object('regra', to_jsonb((select r from public.automation_rules r where r.id = '00000000-0000-0000-0000-000000080b04')))
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a01","role":"authenticated"}', true);

-- 8. acao_tipo = 'email' gera mesmo uma linha em notification_queue, para
--    o email do próprio admin.
select is(
  (select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b04')->>'email_enviado'),
  'true',
  'testar uma regra de email marca email_enviado como verdadeiro'
);

select is(
  (select nq.destinatario from public.notification_queue nq
     join public.notifications n on n.id = nq.notification_id
     where n.titulo like '[Teste]%Seguro a expirar (email)%' order by n.created_at desc limit 1),
  'admin@testar-regra-g.pt',
  'o email de teste vai para o email do próprio testador'
);

-- 9. Repetir de imediato a mesma regra é bloqueado pelo cooldown.
select throws_ok(
  $$ select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b04') $$,
  'P0001',
  null,
  'repetir o teste de imediato é bloqueado pelo cooldown de 30s'
);

reset role;

-- Rebobina o cooldown desta regra — simula que passou tempo suficiente.
update public.automacao_regra_teste_cooldown
set ultimo_teste_em = now() - interval '1 minute'
where rule_id = '00000000-0000-0000-0000-000000080b04';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a01","role":"authenticated"}', true);

-- 10. Passado o cooldown, volta a funcionar.
select isnt(
  (select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b04')->>'notificacao_id'),
  null,
  'passado o cooldown, o teste volta a funcionar'
);

reset role;

-- A regra de notificação (b01) já foi testada no teste 5 — rebobina o
-- cooldown dela também, senão o teste 11 cai no mesmo bloqueio do teste 9.
update public.automacao_regra_teste_cooldown
set ultimo_teste_em = now() - interval '1 minute'
where rule_id = '00000000-0000-0000-0000-000000080b01';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a01","role":"authenticated"}', true);

-- 11. destinatarios_reais inclui o admin (fallback automático de admin).
select ok(
  (select jsonb_array_length(public.testar_regra_automacao('00000000-0000-0000-0000-000000080b01')->'destinatarios_reais') > 0),
  'destinatarios_reais não vem vazio quando há um admin na organização'
);

reset role;

select * from finish();
rollback;
