-- ============================================================
-- Motor de Automação — execute_automation_runs() (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre o Automation Executor: para acao_tipo='notificacao', resolve
-- destinatários por cargo direto (admin OU cargo escolhido na regra),
-- cria uma notifications por destinatário, enfileira email quando
-- enviar_email=true, e falha para dead-letter quando o acao_config
-- está mal configurado. Outros acao_tipo só concluem, sem ação.
-- ============================================================

begin;
select plan(17);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org A', 'exec-runs-a');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0001', 'admin@exec-runs.pt'),
  ('00000000-0000-0000-0000-0000000a0002', 'permitido@exec-runs.pt'),
  ('00000000-0000-0000-0000-0000000a0003', 'sem-permissao@exec-runs.pt');

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-000000c60001', 'Cargo Permitido', '00000000-0000-0000-0000-0000000a0000'),
  ('00000000-0000-0000-0000-000000c60002', 'Cargo Sem Permissao', '00000000-0000-0000-0000-0000000a0000');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0000', true, null),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000a0000', false, '00000000-0000-0000-0000-000000c60001'),
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-0000000a0000', false, '00000000-0000-0000-0000-000000c60002');

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000460001', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_notif', 'Regra de Notificação', 'teste.evento', 'notificacao',
   jsonb_build_object('titulo', 'Titulo de Teste', 'template_codigo', 'teste.notif', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', jsonb_build_array('00000000-0000-0000-0000-000000c60001'), 'enviar_email', true));

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-0000004c0001', '00000000-0000-0000-0000-000000460001', '00000000-0000-0000-0000-0000000a0000', 'viaturas', '00000000-0000-0000-0000-00000ef70001');

select public.execute_automation_runs();

-- 1. O run fica completed.
select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-0000004c0001'),
  'completed',
  'run de acao_tipo=notificacao é concluído com sucesso'
);

-- 2. O admin recebe uma notificação (mesmo sem pertencer ao cargo escolhido).
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-0000000a0001'),
  1,
  'o admin da org recebe a notificação'
);

-- 3. O utilizador do cargo escolhido na regra recebe uma notificação.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-0000000a0002'),
  1,
  'o utilizador do cargo escolhido recebe a notificação'
);

-- 4. O utilizador de outro cargo NÃO recebe notificação.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-0000000a0003'),
  0,
  'o utilizador de outro cargo não recebe a notificação'
);

-- 5. As notificações ficam ligadas ao run que as gerou.
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-0000004c0001'),
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
  ('00000000-0000-0000-0000-000000460002', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_webhook', 'Regra Webhook', 'teste.evento2', 'webhook');

insert into public.automation_runs (id, rule_id, org_id) values
  ('00000000-0000-0000-0000-0000004c0002', '00000000-0000-0000-0000-000000460002', '00000000-0000-0000-0000-0000000a0000');

select public.execute_automation_runs();

-- 7. O run de webhook também fica completed (sem ação real, por agora).
select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-0000004c0002'),
  'completed',
  'run de acao_tipo diferente de notificacao é concluído sem criar notificações'
);

-- 8. ...e não gerou nenhuma notificação.
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-0000004c0002'),
  0,
  'run de webhook não cria notificações'
);

-- Cenário C: uma regra de notificação sem template_codigo já não chega a nascer.
--
-- Este cenário testava outra coisa: criava a regra com `acao_config` vazio e
-- verificava que a EXECUÇÃO falhava para dead-letter. Deixou de ser possível —
-- `fn_validar_acao_config` (migração 20260729120000, dois dias depois de este
-- ficheiro ser escrito) rejeita a regra logo no INSERT.
--
-- A garantia melhorou e o teste acompanha: em vez de nascer uma regra que só
-- se revela partida quando corre — e que entretanto ocupa a fila e gasta
-- tentativas — a regra não nasce. Testar o comportamento antigo seria testar
-- um caminho que o motor já não permite.
--
-- 23514 = check_violation, o ERRCODE que fn_validar_acao_config levanta.
select throws_ok(
  $$insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config)
    values ('00000000-0000-0000-0000-000000460003', '00000000-0000-0000-0000-0000000a0000',
            'teste.regra_ma', 'Regra Mal Configurada', 'teste.evento3', 'notificacao', '{}'::jsonb)$$,
  '23514',
  'acao_config inválido: template_codigo é obrigatório.',
  'uma regra de notificação sem template_codigo é rejeitada no INSERT'
);

-- Cenário D: estratégia gestor_responsavel, entidade motorista — resolve diretamente.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0004', 'gestor.testador@exec-runs.pt');

insert into public.profiles (id, org_id, nome, email, tipo_utilizador) values
  ('00000000-0000-0000-0000-0000000a0004', '00000000-0000-0000-0000-0000000a0000', 'Gestor Testador', 'gestor.testador@exec-runs.pt', 'colaborador');

insert into public.motoristas_ativos (id, org_id, nome, gestor_responsavel) values
  ('00000000-0000-0000-0000-000000e00001', '00000000-0000-0000-0000-0000000a0000', 'Motorista Teste D', 'gestor testador');

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000460004', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_gestor', 'Regra Gestor Responsável', 'teste.evento4', 'notificacao',
   '{"titulo":"Titulo de Teste","template_codigo":"teste.notif","destinatarios_estrategia":"gestor_responsavel","enviar_email":false}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-0000004c0004', '00000000-0000-0000-0000-000000460004', '00000000-0000-0000-0000-0000000a0000', 'motoristas_ativos', '00000000-0000-0000-0000-000000e00001');

select public.execute_automation_runs();

-- 10a. Antes de contar notificações, confirmar que o run CONCLUIU. Sem isto,
--      um run que rebentou aparece como «0 notificações» — um sintoma que não
--      distingue «não notificou ninguém» de «nem chegou a tentar». Concatenar
--      o error_message põe o motivo real na saída do pgTAP quando falha.
select is(
  (select status || coalesce(' :: ' || error_message, '')
     from public.automation_runs where id = '00000000-0000-0000-0000-0000004c0004'),
  'completed',
  'o run da estratégia gestor_responsavel conclui sem erro'
);

-- 10. Só o gestor responsável é notificado (não o admin, não quem tem o recurso).
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-0000004c0004'),
  1,
  'estratégia gestor_responsavel notifica só 1 pessoa (o gestor), não todos os admins/permitidos'
);

-- 11. ...e é especificamente o gestor, resolvido por nome (case-insensitive, com espaços).
select is(
  (select destinatario_user_id from public.notifications where rule_run_id = '00000000-0000-0000-0000-0000004c0004'),
  '00000000-0000-0000-0000-0000000a0004'::uuid,
  'o destinatário é especificamente o gestor responsável (resolvido por nome, case-insensitive)'
);

-- Cenário E: estratégia gestor_responsavel, entidade viatura — resolve via o motorista atualmente atribuído.
--
-- marca/modelo entram por id: o trigger `trg_sync_viatura_marca_modelo` apaga
-- os campos de texto no INSERT quando não há `marca_id`. Ver a nota mais
-- detalhada em executar_jobs_automacao_manualmente.test.sql.
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000008a4c02', '00000000-0000-0000-0000-0000000a0000', 'Toyota');

insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000008e0d02', '00000000-0000-0000-0000-0000000a0000',
   '00000000-0000-0000-0000-0000008a4c02', 'Corolla');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-000000870001', '00000000-0000-0000-0000-0000000a0000', 'GT-00-ER',
   '00000000-0000-0000-0000-0000008a4c02', '00000000-0000-0000-0000-0000008e0d02');

insert into public.motorista_viaturas (id, motorista_id, viatura_id, data_inicio, status) values
  ('00000000-0000-0000-0000-000000e80001', '00000000-0000-0000-0000-000000e00001', '00000000-0000-0000-0000-000000870001', current_date, 'ativo');

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000460005', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_gestor_viatura', 'Regra Gestor Viatura', 'teste.evento5', 'notificacao',
   '{"titulo":"Titulo de Teste","template_codigo":"teste.notif","destinatarios_estrategia":"gestor_responsavel","enviar_email":false}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-0000004c0005', '00000000-0000-0000-0000-000000460005', '00000000-0000-0000-0000-0000000a0000', 'viaturas', '00000000-0000-0000-0000-000000870001');

select public.execute_automation_runs();

-- 12. Para uma viatura, o gestor é resolvido via o motorista atualmente atribuído (motorista_viaturas ativo).
select is(
  (select destinatario_user_id from public.notifications where rule_run_id = '00000000-0000-0000-0000-0000004c0005'),
  '00000000-0000-0000-0000-0000000a0004'::uuid,
  'para entidade viatura, o gestor responsável é resolvido via o motorista atualmente atribuído'
);

-- Cenário F: sem gestor_responsavel definido — cai para o fallback (só admins).
insert into public.motoristas_ativos (id, org_id, nome, gestor_responsavel) values
  ('00000000-0000-0000-0000-000000e00002', '00000000-0000-0000-0000-0000000a0000', 'Motorista Sem Gestor', null);

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000460006', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_gestor_fallback', 'Regra Fallback', 'teste.evento6', 'notificacao',
   '{"titulo":"Titulo de Teste","template_codigo":"teste.notif","destinatarios_estrategia":"gestor_responsavel","enviar_email":false}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-0000004c0006', '00000000-0000-0000-0000-000000460006', '00000000-0000-0000-0000-0000000a0000', 'motoristas_ativos', '00000000-0000-0000-0000-000000e00002');

select public.execute_automation_runs();

-- 13. Sem gestor_responsavel resolvido, cai para o fallback e avisa o admin.
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-0000004c0006' and destinatario_user_id = '00000000-0000-0000-0000-0000000a0001'),
  1,
  'sem gestor_responsavel resolvido, cai para o fallback e avisa o admin da org'
);

-- 14. ...e o fallback NÃO inclui quem só tem o recurso RBAC (só admins, não é a estratégia recurso).
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-0000004c0006' and destinatario_user_id = '00000000-0000-0000-0000-0000000a0002'),
  0,
  'o fallback de gestor_responsavel não inclui quem só tem o recurso RBAC'
);

-- Cenário G: estratégia cargo, modo individual — só a pessoa escolhida
-- recebe, mesmo havendo mais gente no mesmo cargo.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0005', 'outro-do-cargo@exec-runs.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000000a0005', '00000000-0000-0000-0000-0000000a0000', false, '00000000-0000-0000-0000-000000c60001');

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000460007', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_individual', 'Regra Individual', 'teste.evento7', 'notificacao',
   jsonb_build_object('titulo', 'Titulo de Teste', 'template_codigo', 'teste.notif', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', jsonb_build_array('00000000-0000-0000-0000-000000c60001'), 'destinatarios_modo', 'individual', 'destinatarios_user_ids', jsonb_build_array('00000000-0000-0000-0000-0000000a0002'), 'enviar_email', false));

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-0000004c0007', '00000000-0000-0000-0000-000000460007', '00000000-0000-0000-0000-0000000a0000', 'viaturas', '00000000-0000-0000-0000-00000ef70007');

select public.execute_automation_runs();

-- 15. Modo individual: a pessoa escolhida em destinatarios_user_ids recebe.
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-0000004c0007' and destinatario_user_id = '00000000-0000-0000-0000-0000000a0002'),
  1,
  'modo individual: a pessoa escolhida em destinatarios_user_ids recebe'
);

-- 16. Modo individual: outra pessoa do MESMO cargo, não escolhida, não recebe.
select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-0000004c0007' and destinatario_user_id = '00000000-0000-0000-0000-0000000a0005'),
  0,
  'modo individual: outra pessoa do mesmo cargo, não escolhida individualmente, não recebe'
);

select * from finish();
rollback;
