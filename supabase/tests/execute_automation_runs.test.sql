-- ============================================================
-- Motor de Automação — execute_automation_runs() (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre o Automation Executor: para acao_tipo='notificacao', resolve
-- destinatários por recurso RBAC (admin OU cargo com tem_acesso=true),
-- cria uma notifications por destinatário, enfileira email quando
-- enviar_email=true, e falha para dead-letter quando o acao_config
-- está mal configurado. Outros acao_tipo só concluem, sem ação.
-- ============================================================

begin;
select plan(14);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org A', 'exec-runs-a');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0001', 'admin@exec-runs.pt'),
  ('00000000-0000-0000-0000-0000000a0002', 'permitido@exec-runs.pt'),
  ('00000000-0000-0000-0000-0000000a0003', 'sem-permissao@exec-runs.pt');

insert into public.recursos (nome, descricao, categoria) values
  ('teste.recurso_viaturas', 'Recurso de teste', 'teste');

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-000000cg0001', 'Cargo Permitido', '00000000-0000-0000-0000-0000000a0000'),
  ('00000000-0000-0000-0000-000000cg0002', 'Cargo Sem Permissao', '00000000-0000-0000-0000-0000000a0000');

insert into public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, org_id)
select '00000000-0000-0000-0000-000000cg0001', id, true, '00000000-0000-0000-0000-0000000a0000'
from public.recursos where nome = 'teste.recurso_viaturas';

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0000', true, null),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000a0000', false, '00000000-0000-0000-0000-000000cg0001'),
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-0000000a0000', false, '00000000-0000-0000-0000-000000cg0002');

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000rg0001', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_notif', 'Regra de Notificação', 'teste.evento', 'notificacao', '{"template_codigo":"teste.notif","destinatarios_recurso":"teste.recurso_viaturas","enviar_email":true}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-000000ru0001', '00000000-0000-0000-0000-000000rg0001', '00000000-0000-0000-0000-0000000a0000', 'viaturas', '00000000-0000-0000-0000-000000ent0001');

select public.execute_automation_runs();

-- 1. O run fica completed.
select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-000000ru0001'),
  'completed',
  'run de acao_tipo=notificacao é concluído com sucesso'
);

-- 2. O admin recebe uma notificação (mesmo sem o recurso concedido).
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-0000000a0001'),
  1,
  'o admin da org recebe a notificação'
);

-- 3. O utilizador com o recurso concedido recebe uma notificação.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-0000000a0002'),
  1,
  'o utilizador com o recurso concedido recebe a notificação'
);

-- 4. O utilizador sem o recurso NÃO recebe notificação.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-0000000a0003'),
  0,
  'o utilizador sem o recurso não recebe a notificação'
);

-- 5. As notificações ficam ligadas ao run que as gerou.
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-000000ru0001'),
  2,
  'as notificações ficam com rastreabilidade até ao automation_run'
);

-- 6. enviar_email=true cria um item de fila de email por destinatário.
select is(
  (select count(*)::int from public.notification_queue where destinatario = 'admin@exec-runs.pt'),
  1,
  'enviar_email=true cria um item de fila de email para o admin'
);

-- Cenário B: acao_tipo diferente de notificacao só conclui, sem ação.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo) values
  ('00000000-0000-0000-0000-000000rg0002', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_webhook', 'Regra Webhook', 'teste.evento2', 'webhook');

insert into public.automation_runs (id, rule_id, org_id) values
  ('00000000-0000-0000-0000-000000ru0002', '00000000-0000-0000-0000-000000rg0002', '00000000-0000-0000-0000-0000000a0000');

select public.execute_automation_runs();

-- 7. O run de webhook também fica completed (sem ação real, por agora).
select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-000000ru0002'),
  'completed',
  'run de acao_tipo diferente de notificacao é concluído sem criar notificações'
);

-- 8. ...e não gerou nenhuma notificação.
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-000000ru0002'),
  0,
  'run de webhook não cria notificações'
);

-- Cenário C: acao_config sem template_codigo falha para dead-letter (max_attempts=1).
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000rg0003', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_ma', 'Regra Mal Configurada', 'teste.evento3', 'notificacao', '{"destinatarios_recurso":"teste.recurso_viaturas"}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, max_attempts) values
  ('00000000-0000-0000-0000-000000ru0003', '00000000-0000-0000-0000-000000rg0003', '00000000-0000-0000-0000-0000000a0000', 1);

select public.execute_automation_runs();

-- 9. Falha (template_codigo NULL viola NOT NULL) e, com max_attempts=1, vai logo para dead-letter.
select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-000000ru0003'),
  'failed',
  'acao_config sem template_codigo falha e vai para dead-letter'
);

-- Cenário D: estratégia gestor_responsavel, entidade motorista — resolve diretamente.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0004', 'gestor.testador@exec-runs.pt');

insert into public.profiles (id, org_id, nome, email, tipo_utilizador) values
  ('00000000-0000-0000-0000-0000000a0004', '00000000-0000-0000-0000-0000000a0000', 'Gestor Testador', 'gestor.testador@exec-runs.pt', 'colaborador');

insert into public.motoristas_ativos (id, org_id, nome, gestor_responsavel) values
  ('00000000-0000-0000-0000-000000mo0001', '00000000-0000-0000-0000-0000000a0000', 'Motorista Teste D', 'gestor testador');

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000rg0004', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_gestor', 'Regra Gestor Responsável', 'teste.evento4', 'notificacao',
   '{"template_codigo":"teste.notif","destinatarios_estrategia":"gestor_responsavel","enviar_email":false}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-000000ru0004', '00000000-0000-0000-0000-000000rg0004', '00000000-0000-0000-0000-0000000a0000', 'motoristas_ativos', '00000000-0000-0000-0000-000000mo0001');

select public.execute_automation_runs();

-- 10. Só o gestor responsável é notificado (não o admin, não quem tem o recurso).
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-000000ru0004'),
  1,
  'estratégia gestor_responsavel notifica só 1 pessoa (o gestor), não todos os admins/permitidos'
);

-- 11. ...e é especificamente o gestor, resolvido por nome (case-insensitive, com espaços).
select is(
  (select destinatario_user_id from public.notifications where rule_run_id = '00000000-0000-0000-0000-000000ru0004'),
  '00000000-0000-0000-0000-0000000a0004'::uuid,
  'o destinatário é especificamente o gestor responsável (resolvido por nome, case-insensitive)'
);

-- Cenário E: estratégia gestor_responsavel, entidade viatura — resolve via o motorista atualmente atribuído.
insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-000000vt0001', '00000000-0000-0000-0000-0000000a0000', 'GT-00-ER', 'Toyota', 'Corolla');

insert into public.motorista_viaturas (id, motorista_id, viatura_id, data_inicio, status) values
  ('00000000-0000-0000-0000-000000mv0001', '00000000-0000-0000-0000-000000mo0001', '00000000-0000-0000-0000-000000vt0001', current_date, 'ativo');

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000rg0005', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_gestor_viatura', 'Regra Gestor Viatura', 'teste.evento5', 'notificacao',
   '{"template_codigo":"teste.notif","destinatarios_estrategia":"gestor_responsavel","enviar_email":false}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-000000ru0005', '00000000-0000-0000-0000-000000rg0005', '00000000-0000-0000-0000-0000000a0000', 'viaturas', '00000000-0000-0000-0000-000000vt0001');

select public.execute_automation_runs();

-- 12. Para uma viatura, o gestor é resolvido via o motorista atualmente atribuído (motorista_viaturas ativo).
select is(
  (select destinatario_user_id from public.notifications where rule_run_id = '00000000-0000-0000-0000-000000ru0005'),
  '00000000-0000-0000-0000-0000000a0004'::uuid,
  'para entidade viatura, o gestor responsável é resolvido via o motorista atualmente atribuído'
);

-- Cenário F: sem gestor_responsavel definido — cai para o fallback (só admins).
insert into public.motoristas_ativos (id, org_id, nome, gestor_responsavel) values
  ('00000000-0000-0000-0000-000000mo0002', '00000000-0000-0000-0000-0000000a0000', 'Motorista Sem Gestor', null);

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000rg0006', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_gestor_fallback', 'Regra Fallback', 'teste.evento6', 'notificacao',
   '{"template_codigo":"teste.notif","destinatarios_estrategia":"gestor_responsavel","enviar_email":false}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-000000ru0006', '00000000-0000-0000-0000-000000rg0006', '00000000-0000-0000-0000-0000000a0000', 'motoristas_ativos', '00000000-0000-0000-0000-000000mo0002');

select public.execute_automation_runs();

-- 13. Sem gestor_responsavel resolvido, cai para o fallback e avisa o admin.
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-000000ru0006' and destinatario_user_id = '00000000-0000-0000-0000-0000000a0001'),
  1,
  'sem gestor_responsavel resolvido, cai para o fallback e avisa o admin da org'
);

-- 14. ...e o fallback NÃO inclui quem só tem o recurso RBAC (só admins, não é a estratégia recurso).
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-000000ru0006' and destinatario_user_id = '00000000-0000-0000-0000-0000000a0002'),
  0,
  'o fallback de gestor_responsavel não inclui quem só tem o recurso RBAC'
);

select * from finish();
rollback;
