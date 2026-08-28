-- ============================================================
-- Definição congelada da regra (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre a Fase 3. A garantia sob teste é uma só:
--
--   um run executa exactamente a definição que lhe foi atribuída quando
--   nasceu. Editar a automação depois disso não muda o significado do run.
--
-- ── COMO SE PROVA ───────────────────────────────────────────────────────────
--
-- Não basta olhar para o snapshot guardado: isso provaria que a coluna foi
-- escrita, não que o executor a usa. Cada cenário faz as duas coisas —
-- verifica o conteúdo congelado E o EFEITO produzido (que `template_codigo`
-- saiu na notificação, que pessoa a recebeu). O efeito é a prova.
--
-- Os runs nascem pelo caminho real: `domain_events` → `process_domain_events`.
-- Criar runs à mão saltaria precisamente o sítio onde o snapshot é feito.
--
-- ── PORQUE UM event_type INVENTADO E NÃO UM REAL ────────────────────────────
--
-- Criar uma organização dispara `trg_organizacoes_seed_automacao`, que semeia
-- o conjunto de regras por omissão — incluindo uma para
-- `viatura.seguro_expirando`. Com um event_type real, cada evento casaria com
-- DUAS regras (a semeada e a deste ficheiro), nasceriam dois runs para o mesmo
-- `trigger_event_id`, e as asserções rebentariam com «more than one row
-- returned by a subquery». Foi exactamente o que aconteceu na primeira
-- passagem pelo CI.
--
-- Com `teste.f3_snapshot` só a regra deste ficheiro casa. Efeito secundário:
-- `v_tipo_legado` fica NULL, portanto não há escrita em `notificacoes` nem
-- supressão por aviso em aberto. Nenhuma asserção depende disso — todas olham
-- para `notifications`, `automation_runs` e a vista.
--
-- ── PORQUE VIATURAS DIFERENTES EM CADA CENÁRIO ──────────────────────────────
--
-- `idx_automation_runs_one_active_per_rule_entity` é único em
-- (rule_id, entity_table, entity_id) enquanto o run está pendente ou a correr.
-- Os cenários T7 e T8 têm dois runs pendentes ao mesmo tempo: com a mesma
-- viatura, o segundo insert violaria o índice e seria engolido pelo
-- `exception when unique_violation` do casamento — o teste mediria o índice em
-- vez do snapshot.
--
-- ── PORQUE O ADMIN RECEBE SEMPRE ────────────────────────────────────────────
--
-- O executor inclui sempre os admins da org, qualquer que seja a estratégia.
-- O admin existe aqui porque `retry_failed_job` exige permissão; por isso as
-- asserções de destinatário contam pessoas ESPECÍFICAS e nunca totais.
-- ============================================================

begin;
select plan(27);

-- ── Cenário base ────────────────────────────────────────────
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f3000', 'Org Snapshot A', 'f3-a'),
  ('00000000-0000-0000-0000-0000000f3b00', 'Org Snapshot B', 'f3-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f3001', 'admin@f3.pt'),
  ('00000000-0000-0000-0000-0000000f3002', 'cargo-um@f3.pt'),
  ('00000000-0000-0000-0000-0000000f3003', 'cargo-dois@f3.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000f3001', '00000000-0000-0000-0000-0000000f3000');

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-0000c0f30001', 'Cargo Um',   '00000000-0000-0000-0000-0000000f3000'),
  ('00000000-0000-0000-0000-0000c0f30002', 'Cargo Dois', '00000000-0000-0000-0000-0000000f3000');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000000f3001', '00000000-0000-0000-0000-0000000f3000', true,  null),
  ('00000000-0000-0000-0000-0000000f3002', '00000000-0000-0000-0000-0000000f3000', false, '00000000-0000-0000-0000-0000c0f30001'),
  ('00000000-0000-0000-0000-0000000f3003', '00000000-0000-0000-0000-0000000f3000', false, '00000000-0000-0000-0000-0000c0f30002');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00008a4f3001', '00000000-0000-0000-0000-0000000f3000', 'Peugeot');

insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-00008e4f3001', '00000000-0000-0000-0000-0000000f3000',
   '00000000-0000-0000-0000-00008a4f3001', '208');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id)
select v.id, '00000000-0000-0000-0000-0000000f3000', v.matricula,
       '00000000-0000-0000-0000-00008a4f3001', '00000000-0000-0000-0000-00008e4f3001'
from (values
  ('00000000-0000-0000-0000-0000870f3001'::uuid, 'F3-01-AA'),
  ('00000000-0000-0000-0000-0000870f3002'::uuid, 'F3-02-AA'),
  ('00000000-0000-0000-0000-0000870f3003'::uuid, 'F3-03-AA'),
  ('00000000-0000-0000-0000-0000870f3004'::uuid, 'F3-04-AA'),
  ('00000000-0000-0000-0000-0000870f3005'::uuid, 'F3-05-AA'),
  ('00000000-0000-0000-0000-0000870f3006'::uuid, 'F3-06-AA'),
  ('00000000-0000-0000-0000-0000870f3007'::uuid, 'F3-07-AA')
  ,('00000000-0000-0000-0000-0000870f3008'::uuid, 'F3-08-AA')
) as v(id, matricula);

-- Regra na versão 1: template `v1.template`, destinatários do Cargo Um.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-00004600f301', '00000000-0000-0000-0000-0000000f3000',
   'teste.f3', 'Regra F3', 'teste.f3_snapshot', 'notificacao',
   jsonb_build_object(
     'titulo', 'Seguro a expirar',
     'template_codigo', 'v1.template',
     'destinatarios_estrategia', 'cargo',
     'destinatarios_cargo_ids', jsonb_build_array('00000000-0000-0000-0000-0000c0f30001'),
     'enviar_email', true));

-- ════════════════════════════════════════════════════════════
-- Nascimento: o snapshot é feito no casamento
-- ════════════════════════════════════════════════════════════
insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at) values
  ('00000000-0000-0000-0000-00000e0f3001', '00000000-0000-0000-0000-0000000f3000',
   'teste.f3_snapshot', 'viaturas', '00000000-0000-0000-0000-0000870f3001', 'manual', now() - interval '5 minutes');

select public.process_domain_events();

select is(
  (select rule_snapshot->'regra'->'acao_config'->>'template_codigo'
     from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3001'),
  'v1.template',
  'o run nasce com a definição da regra congelada'
);

select is(
  (select (rule_snapshot->>'schema_version') || ':' || (length(rule_snapshot->>'definition_hash'))::text
     from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3001'),
  '1:32',
  'o snapshot traz schema_version e um definition_hash de 32 caracteres'
);

-- ════════════════════════════════════════════════════════════
-- T1 + T3 + T4 — editar a regra não muda o run que já nasceu
-- ════════════════════════════════════════════════════════════
update public.automation_rules
   set acao_config = jsonb_build_object(
     'titulo', 'Seguro a expirar',
     'template_codigo', 'v2.template',
     'destinatarios_estrategia', 'cargo',
     'destinatarios_cargo_ids', jsonb_build_array('00000000-0000-0000-0000-0000c0f30002'),
     'enviar_email', true)
 where id = '00000000-0000-0000-0000-00004600f301';

select is(
  (select rule_snapshot->'regra'->'acao_config'->>'template_codigo'
     from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3001'),
  'v1.template',
  'T1: editar a regra não toca no snapshot de um run já criado'
);

-- T4: a acao_config inteira está congelada, não só o template.
select is(
  (select rule_snapshot->'regra'->'acao_config'->'destinatarios_cargo_ids'
     from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3001'),
  jsonb_build_array('00000000-0000-0000-0000-0000c0f30001'),
  'T4: a acao_config congelada mantém os destinatários da v1'
);

select public.execute_automation_runs();

select is(
  (select status || coalesce(' :: ' || error_message, '')
     from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3001'),
  'completed',
  'o run da v1 conclui a partir do snapshot'
);

-- A asserção que dá nome à fase: o EFEITO, não o conteúdo da coluna.
select is(
  (select distinct template_codigo from public.notifications n
     join public.automation_runs r on r.id = n.rule_run_id
    where r.trigger_event_id = '00000000-0000-0000-0000-00000e0f3001'),
  'v1.template',
  'T1: o run executa o template da v1, com a regra já em v2'
);

select is(
  (select count(*)::int from public.notifications n
     join public.automation_runs r on r.id = n.rule_run_id
    where r.trigger_event_id = '00000000-0000-0000-0000-00000e0f3001'
      and n.destinatario_user_id = '00000000-0000-0000-0000-0000000f3002'),
  1,
  'T3: o destinatário da v1 (Cargo Um) recebe'
);

select is(
  (select count(*)::int from public.notifications n
     join public.automation_runs r on r.id = n.rule_run_id
    where r.trigger_event_id = '00000000-0000-0000-0000-00000e0f3001'
      and n.destinatario_user_id = '00000000-0000-0000-0000-0000000f3003'),
  0,
  'T3: o destinatário novo (Cargo Dois) NÃO recebe no run antigo'
);

-- ════════════════════════════════════════════════════════════
-- T2 — um run novo depois da edição usa a v2
-- ════════════════════════════════════════════════════════════
insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at) values
  ('00000000-0000-0000-0000-00000e0f3002', '00000000-0000-0000-0000-0000000f3000',
   'teste.f3_snapshot', 'viaturas', '00000000-0000-0000-0000-0000870f3002', 'manual', now() - interval '4 minutes');

select public.process_domain_events();

select is(
  (select rule_snapshot->'regra'->'acao_config'->>'template_codigo'
     from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3002'),
  'v2.template',
  'T2: um run criado depois da edição congela a v2'
);

select public.execute_automation_runs();

select is(
  (select distinct template_codigo from public.notifications n
     join public.automation_runs r on r.id = n.rule_run_id
    where r.trigger_event_id = '00000000-0000-0000-0000-00000e0f3002'),
  'v2.template',
  'T2: o run novo executa o template da v2'
);

select is(
  (select count(*)::int from public.notifications n
     join public.automation_runs r on r.id = n.rule_run_id
    where r.trigger_event_id = '00000000-0000-0000-0000-00000e0f3002'
      and n.destinatario_user_id = '00000000-0000-0000-0000-0000000f3003'),
  1,
  'T3: o destinatário da v2 (Cargo Dois) recebe no run novo'
);

-- ════════════════════════════════════════════════════════════
-- T5 + T6 — retry e retry manual não reinterpretam
-- ════════════════════════════════════════════════════════════
-- Dois runs nascidos sob a v2: um vai falhar e voltar por backoff, o outro vai
-- esgotar tentativas e cair na dead-letter. Só depois a regra passa a v3.
insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at) values
  ('00000000-0000-0000-0000-00000e0f3003', '00000000-0000-0000-0000-0000000f3000',
   'teste.f3_snapshot', 'viaturas', '00000000-0000-0000-0000-0000870f3003', 'manual', now() - interval '3 minutes'),
  ('00000000-0000-0000-0000-00000e0f3004', '00000000-0000-0000-0000-0000000f3000',
   'teste.f3_snapshot', 'viaturas', '00000000-0000-0000-0000-0000870f3004', 'manual', now() - interval '3 minutes');

select public.process_domain_events();

-- Falha com tentativas por esgotar: volta a pending com backoff no futuro, que
-- é o que o varrimento de presos produz. Adianta-se o relógio do run em vez de
-- esperar.
select public.automation_runs_fail(
  (select id from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3003'),
  'falha simulada');

update public.automation_runs set next_attempt_at = now()
 where trigger_event_id = '00000000-0000-0000-0000-00000e0f3003';

-- Esgota as tentativas do outro: vai a failed e à dead-letter.
update public.automation_runs set attempt = max_attempts
 where trigger_event_id = '00000000-0000-0000-0000-00000e0f3004';

select public.automation_runs_fail(
  (select id from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3004'),
  'falha final simulada');

-- Só agora a regra muda.
update public.automation_rules
   set acao_config = jsonb_set(acao_config, '{template_codigo}', '"v3.template"')
 where id = '00000000-0000-0000-0000-00004600f301';

select public.execute_automation_runs();

select is(
  (select rule_snapshot->'regra'->'acao_config'->>'template_codigo'
     from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3003'),
  'v2.template',
  'T5: o retry não recarrega a regra — o snapshot continua na v2'
);

select is(
  (select distinct template_codigo from public.notifications n
     join public.automation_runs r on r.id = n.rule_run_id
    where r.trigger_event_id = '00000000-0000-0000-0000-00000e0f3003'),
  'v2.template',
  'T5: o run retentado executa a v2, com a regra já em v3'
);

-- T6: reagendamento manual a partir da dead-letter.
--
-- O id do failed_job resolve-se ANTES de trocar de papel, e viaja numa
-- definição de configuração em vez de numa tabela.
--
-- A primeira tentativa lia-o de uma subconsulta depois do `set local role
-- authenticated`, e a RLS podia esvaziá-la — o teste falharia com «failed_job
-- não encontrado», que parece um problema de permissões e não é. A segunda
-- usou uma tabela temporária, que de facto não tem RLS, mas pertence ao
-- superutilizador: `authenticated` não tem SELECT nela e o CI respondeu
-- «permission denied for table f3_job_reagendar».
--
-- Uma definição de configuração não tem nem RLS nem dono. `set_config(...,
-- true)` é local à transacção, e esta acaba em `rollback`.
select set_config(
  'f3.job_id',
  (select fj.id::text
     from public.failed_jobs fj
     join public.automation_runs r on r.id = fj.source_id
    where fj.source_table = 'automation_runs'
      and r.trigger_event_id = '00000000-0000-0000-0000-00000e0f3004'),
  true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f3001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f3001","role":"authenticated"}', true);

select public.retry_failed_job(current_setting('f3.job_id')::uuid);

reset role;

select is(
  (select status from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3004'),
  'pending',
  'T6: o reagendamento manual devolve o run a pending'
);

select is(
  (select rule_snapshot->'regra'->'acao_config'->>'template_codigo'
     from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3004'),
  'v2.template',
  'T6: reagendar da dead-letter mantém o snapshot original — não adopta a v3'
);

select public.execute_automation_runs();

select is(
  (select distinct template_codigo from public.notifications n
     join public.automation_runs r on r.id = n.rule_run_id
    where r.trigger_event_id = '00000000-0000-0000-0000-00000e0f3004'),
  'v2.template',
  'T6: o run reagendado executa a v2'
);

-- Dois runs nascidos da mesma versão têm o mesmo hash; de versões diferentes,
-- hashes diferentes. É isto que torna a tabela de versões uma migração
-- aditiva mais tarde, em vez de histórico perdido.
select is(
  (select r3.rule_snapshot->>'definition_hash' = r4.rule_snapshot->>'definition_hash'
     from public.automation_runs r3, public.automation_runs r4
    where r3.trigger_event_id = '00000000-0000-0000-0000-00000e0f3003'
      and r4.trigger_event_id = '00000000-0000-0000-0000-00000e0f3004'),
  true,
  'dois runs da mesma versão da regra partilham o definition_hash'
);

select is(
  (select r1.rule_snapshot->>'definition_hash' = r2.rule_snapshot->>'definition_hash'
     from public.automation_runs r1, public.automation_runs r2
    where r1.trigger_event_id = '00000000-0000-0000-0000-00000e0f3001'
      and r2.trigger_event_id = '00000000-0000-0000-0000-00000e0f3002'),
  false,
  'runs de versões diferentes têm definition_hash diferente'
);

-- Observabilidade: a pergunta que motivou a fase, respondível por SELECT.
select is(
  (select regra_mudou_desde_o_run from public.automation_runs_definicao
    where run_id = (select id from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3001')),
  true,
  'a vista diz que a regra mudou desde o run da v1'
);

-- ════════════════════════════════════════════════════════════
-- T9 — isolamento multi-org, imposto pelo banco
-- ════════════════════════════════════════════════════════════
-- 23514 = check_violation. A garantia não é «o plpgsql tem cuidado»: é que uma
-- definição de outra organização não chega a ser gravada.
select throws_ok(
  $$insert into public.automation_runs (org_id, rule_id, rule_snapshot)
    values (
      '00000000-0000-0000-0000-0000000f3000',
      null,
      jsonb_build_object(
        'schema_version', 1,
        'definition_hash', 'ffffffffffffffffffffffffffffffff',
        'regra', jsonb_build_object('org_id', '00000000-0000-0000-0000-0000000f3b00')))$$,
  '23514',
  null,
  'T9: um run não pode guardar uma definição de outra organização'
);

-- ════════════════════════════════════════════════════════════
-- T10 — run histórico sem definição congelada
-- ════════════════════════════════════════════════════════════
-- A regra viva está em v3 e continua a existir. Um run sem snapshot NÃO pode
-- cair para ela: seria reintroduzir o problema da fase, em silêncio.
--
-- O UPDATE a seguir ao INSERT não é um atalho, é a única forma de obter a
-- forma histórica: `trg_automation_runs_congelar_definicao` é BEFORE INSERT e
-- congela tudo o que nasce com `rule_id`. O que se reproduz aqui é um run
-- gravado ANTES desta migração — com regra, sem definição.
insert into public.automation_runs (id, rule_id, org_id, status, entity_table, entity_id) values
  ('00000000-0000-0000-0000-00004c0f3001', '00000000-0000-0000-0000-00004600f301',
   '00000000-0000-0000-0000-0000000f3000', 'pending', 'viaturas', '00000000-0000-0000-0000-0000870f3005');

update public.automation_runs set rule_snapshot = null
 where id = '00000000-0000-0000-0000-00004c0f3001';

select public.execute_automation_runs();

select ok(
  (select error_message like '%sem definição congelada%'
     from public.automation_runs where id = '00000000-0000-0000-0000-00004c0f3001'),
  'T10: um run sem snapshot é recusado com mensagem explícita'
);

select is(
  (select count(*)::int from public.notifications
    where rule_run_id = '00000000-0000-0000-0000-00004c0f3001'),
  0,
  'T10: e não executa nada a partir da regra viva'
);

-- ════════════════════════════════════════════════════════════
-- T7 — política de desativação: trava runs NOVOS, não os agendados
-- ════════════════════════════════════════════════════════════
-- Dois runs nascem ainda com a regra activa e ficam por executar. Só depois a
-- regra é desligada.
insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at) values
  ('00000000-0000-0000-0000-00000e0f3005', '00000000-0000-0000-0000-0000000f3000',
   'teste.f3_snapshot', 'viaturas', '00000000-0000-0000-0000-0000870f3006', 'manual', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-00000e0f3006', '00000000-0000-0000-0000-0000000f3000',
   'teste.f3_snapshot', 'viaturas', '00000000-0000-0000-0000-0000870f3007', 'manual', now() - interval '2 minutes');

select public.process_domain_events();

-- O segundo fica guardado para T8: adia-se o seu relógio para que a execução
-- de T7 não o consuma. Sem isto ele executaria já aqui e o cenário «a regra
-- foi apagada» passaria a medir uma execução que tinha acontecido antes.
update public.automation_runs set next_attempt_at = now() + interval '1 hour'
 where trigger_event_id = '00000000-0000-0000-0000-00000e0f3006';

update public.automation_rules set ativo = false
 where id = '00000000-0000-0000-0000-00004600f301';

-- Evento novo com a regra desligada: não deve nascer run nenhum.
insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at) values
  ('00000000-0000-0000-0000-00000e0f3007', '00000000-0000-0000-0000-0000000f3000',
   'teste.f3_snapshot', 'viaturas', '00000000-0000-0000-0000-0000870f3008', 'manual', now() - interval '1 minute');

select public.process_domain_events();

select is(
  (select count(*)::int from public.automation_runs
    where trigger_event_id = '00000000-0000-0000-0000-00000e0f3007'),
  0,
  'T7: desativar a regra impede runs NOVOS'
);

select public.execute_automation_runs();

select is(
  (select status from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3005'),
  'completed',
  'T7: um run agendado antes da desativação continua e conclui — trabalho já materializado'
);

-- ════════════════════════════════════════════════════════════
-- T8 — apagar a regra não apaga o histórico
-- ════════════════════════════════════════════════════════════
-- Antes da Fase 3 a FK era `on delete cascade`: isto apagava todos os runs.
delete from public.automation_rules where id = '00000000-0000-0000-0000-00004600f301';

select cmp_ok(
  (select count(*)::int from public.automation_runs
    where org_id = '00000000-0000-0000-0000-0000000f3000'),
  '>=',
  7,
  'T8: apagar a regra não apaga os runs que ela produziu'
);

select is(
  (select coalesce(rule_id::text, 'NULL') || ' / ' || (rule_snapshot->'regra'->'acao_config'->>'template_codigo')
     from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-00000e0f3001'),
  'NULL / v1.template',
  'T8: o rule_id fica a NULL e a definição congelada sobrevive intacta'
);

-- E o run que ficou guardado ainda executa, já sem regra nenhuma na tabela.
update public.automation_runs set next_attempt_at = now()
 where trigger_event_id = '00000000-0000-0000-0000-00000e0f3006';

select public.execute_automation_runs();

select is(
  (select distinct template_codigo from public.notifications n
     join public.automation_runs r on r.id = n.rule_run_id
    where r.trigger_event_id = '00000000-0000-0000-0000-00000e0f3006'),
  'v3.template',
  'T8: um run cuja regra já não existe executa a partir do seu snapshot'
);

select * from finish();
rollback;
