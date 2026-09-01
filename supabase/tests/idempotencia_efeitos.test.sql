-- ============================================================
-- Idempotência dos efeitos do motor (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre a Fase 2 do hardening. A garantia sob teste é uma só:
--
--   a mesma execução lógica de uma automação não produz o mesmo efeito duas
--   vezes, mesmo que o worker corra o mesmo passo várias vezes.
--
-- ── COMO SE SIMULA UM RETRY ─────────────────────────────────────────────────
--
-- `automation_runs_claim()` devolve a `pending` um run preso em `running` há
-- mais de 15 minutos — é o varrimento de presos, documentado em
-- automation_queue.test.sql. Aqui reproduz-se o RESULTADO desse varrimento
-- (`status = 'pending'`, `started_at` a null, `next_attempt_at` já vencido) em
-- vez de esperar 15 minutos. O caminho a seguir é o real: o run é reclamado
-- outra vez e `execute_automation_runs()` volta a percorrer os três inserts.
--
-- ── OS TRÊS EFEITOS ─────────────────────────────────────────────────────────
--
--   notifications       índice único parcial (rule_run_id, destinatario_user_id)
--   notificacoes        índice único parcial (rule_run_id, destinatario_id)
--                       + a regra nova em fn_notificacoes_agrupar
--   notification_queue  índice único (notification_id, canal, destinatario)
--
-- O caso de `notificacoes` é o menos óbvio e tem teste próprio (T3/T4): o
-- trigger de agrupamento CANCELA o insert e funde na linha existente, portanto
-- no caminho agrupado o índice único nunca chega a ser consultado. Sem a regra
-- nova, o retry não criava linha — incrementava `agrupadas` e repetia o item.
-- O utilizador via "3 avisos" onde houve 2 eventos. Duplicação na mesma.
--
-- ── PORQUE `enviar_email: true` NA REGRA DE NOTIFICAÇÃO ─────────────────────
--
-- `trg_notifications_so_quando_ha_email` cancela o insert em `notifications`
-- quando a regra tem `enviar_email = false`. Com `false`, todas as contagens
-- de `notifications`/`notificacoes` deste ficheiro dariam 0 sem nada estar
-- partido. Ver a nota longa no topo de execute_automation_runs.test.sql.
--
-- ── PORQUE A FILA (notification_queue) PRECISA DE UMA REGRA `email` ─────────
--
-- Desde a divisão entre notificação e email (2026-09-01), o executor decide
-- ENFILEIRAR pelo `acao_tipo`, não por `enviar_email` na config — só uma regra
-- `acao_tipo='email'` produz linhas em `notification_queue`; uma notificação
-- nunca produz, mesmo com a chave antiga presente (é o que as primeiras duas
-- asserções de fila provam). Por isso as secções deste ficheiro que testam a
-- idempotência da FILA usam uma segunda regra, dedicada, com `acao_tipo='email'`.
--
-- ── PORQUE `event_type` NÃO É INVENTADO ─────────────────────────────────────
--
-- O executor só escreve em `notificacoes` quando o `event_type` da regra tem
-- correspondência no CASE de `v_tipo_legado` — 18 valores fixos. Com um
-- `teste.evento` qualquer, `v_tipo_legado` é NULL e o dual-write não acontece:
-- metade deste ficheiro passaria a testar nada.
--
-- ── O QUE ESTE FICHEIRO NÃO PROVA ───────────────────────────────────────────
--
-- Concorrência real. O pgTAP corre numa única sessão, portanto não é possível
-- aqui pôr dois workers a inserir o mesmo efeito ao mesmo tempo. O que se prova
-- é a garantia OBSERVÁVEL do retry sequencial, mais — em T7 — que a segunda
-- escrita é rejeitada pelo BANCO com 23505, e não por um `if not exists` no
-- código. É essa rejeição que continua a valer com duas sessões: um índice
-- único é avaliado na escrita, não num ramo do plpgsql.
--
-- A prova de concorrência a sério precisa de duas ligações (dblink ou teste de
-- carga) e fica registada como lacuna conhecida em
-- docs/motor-automacao/reconstrucao-migracoes.md, ao lado da mesma lacuna em
-- domain_events_claim.test.sql.
-- ============================================================

begin;
select plan(29);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000d0000', 'Org Idempotencia', 'idem-a');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d0001', 'admin@idem.pt'),
  ('00000000-0000-0000-0000-0000000d0002', 'permitido@idem.pt');

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-000000cd0001', 'Cargo Idem', '00000000-0000-0000-0000-0000000d0000');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0000', true, null),
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000d0000', false, '00000000-0000-0000-0000-000000cd0001');

-- `notificacoes.viatura_id` tem FK para `viaturas`, e o executor preenche-a a
-- partir de `entity_id` quando `entity_table = 'viaturas'`. As viaturas têm de
-- existir mesmo. marca/modelo entram por id porque
-- `trg_sync_viatura_marca_modelo` apaga os campos de texto no INSERT quando não
-- há `marca_id` — mesma razão detalhada em
-- executar_jobs_automacao_manualmente.test.sql.
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00008a4d0001', '00000000-0000-0000-0000-0000000d0000', 'Renault');

insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-00008e4d0001', '00000000-0000-0000-0000-0000000d0000',
   '00000000-0000-0000-0000-00008a4d0001', 'Clio');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-0000008d0001', '00000000-0000-0000-0000-0000000d0000', 'ID-01-EM',
   '00000000-0000-0000-0000-00008a4d0001', '00000000-0000-0000-0000-00008e4d0001'),
  ('00000000-0000-0000-0000-0000008d0002', '00000000-0000-0000-0000-0000000d0000', 'ID-02-EM',
   '00000000-0000-0000-0000-00008a4d0001', '00000000-0000-0000-0000-00008e4d0001');

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-0000004d0001', '00000000-0000-0000-0000-0000000d0000',
   'teste.idem_seguro', 'Regra Seguro', 'viatura.seguro_expirando', 'notificacao',
   jsonb_build_object(
     'titulo', 'Seguro a expirar',
     'template_codigo', 'teste.idem',
     'destinatarios_estrategia', 'cargo',
     'destinatarios_cargo_ids', jsonb_build_array('00000000-0000-0000-0000-000000cd0001'),
     'enviar_email', true));

-- ════════════════════════════════════════════════════════════
-- T1/T2/T5 — primeira execução: dois destinatários, um efeito cada
-- ════════════════════════════════════════════════════════════
insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-00000c4d0001', '00000000-0000-0000-0000-0000004d0001',
   '00000000-0000-0000-0000-0000000d0000', 'viaturas', '00000000-0000-0000-0000-0000008d0001');

select public.execute_automation_runs();

-- Antes de contar efeitos, confirmar que o run concluiu. Sem isto, «0 efeitos»
-- não distingue «não produziu» de «rebentou antes de tentar» — e o
-- `error_message` concatenado põe o motivo real na saída do pgTAP.
select is(
  (select status || coalesce(' :: ' || error_message, '')
     from public.automation_runs where id = '00000000-0000-0000-0000-00000c4d0001'),
  'completed',
  'a primeira execução do run A conclui sem erro'
);

select is(
  (select count(*)::int from public.notifications
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0001'),
  2,
  'run A cria uma notifications por destinatário (admin + cargo)'
);

-- T5: mesmo run, destinatários diferentes → efeitos diferentes. A chave de
-- idempotência é (run, destinatário), não o run sozinho.
select is(
  (select count(distinct destinatario_id)::int from public.notificacoes
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0001'),
  2,
  'o mesmo run produz efeitos distintos para destinatários distintos'
);

-- Desde a divisão entre notificação e email (2026-09-01), o executor decide
-- enfileirar pelo `acao_tipo`, não por `enviar_email` na config. Uma regra
-- `notificacao` NUNCA enfileira, mesmo com a chave antiga presente — aqui ela
-- só serve para manter viva a linha de `notifications`, ver a nota do topo.
-- A prova POSITIVA do enfileiramento é mais abaixo, com `acao_tipo='email'`.
select is(
  (select count(*)::int from public.notification_queue q
     join public.notifications n on n.id = q.notification_id
    where n.rule_run_id = '00000000-0000-0000-0000-00000c4d0001'),
  0,
  'uma regra de notificação nunca enfileira email — isso passou a ser a acção email'
);

select is(
  (select coalesce(sum(agrupadas), 0)::int from public.notificacoes
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0001'),
  2,
  'as duas notificacoes nascem com agrupadas = 1 cada'
);

-- ════════════════════════════════════════════════════════════
-- T1/T3 — retry do run A. O CASO CENTRAL DESTE FICHEIRO.
-- ════════════════════════════════════════════════════════════
-- Isto é o que o varrimento de presos deixa para trás quando um worker morre
-- depois de persistir efeitos e antes de concluir o run.
update public.automation_runs
   set status = 'pending', started_at = null, next_attempt_at = now()
 where id = '00000000-0000-0000-0000-00000c4d0001';

select public.execute_automation_runs();

select is(
  (select status || coalesce(' :: ' || error_message, '')
     from public.automation_runs where id = '00000000-0000-0000-0000-00000c4d0001'),
  'completed',
  'o retry conclui: o efeito repetido é absorvido, não rebenta o run'
);

select is(
  (select count(*)::int from public.notifications
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0001'),
  2,
  'o retry não cria notifications novas'
);

select is(
  (select count(*)::int from public.notification_queue q
     join public.notifications n on n.id = q.notification_id
    where n.rule_run_id = '00000000-0000-0000-0000-00000c4d0001'),
  0,
  'o retry de uma notificação continua sem enfileirar nada'
);

select is(
  (select count(*)::int from public.notificacoes
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0001'),
  2,
  'o retry não cria notificacoes novas'
);

-- T3, obrigatório: a duplicação no caminho AGRUPADO não se vê na contagem de
-- linhas — vê-se no contador. Sem a regra nova em fn_notificacoes_agrupar,
-- estas duas asserções davam 4 e 4.
select is(
  (select coalesce(sum(agrupadas), 0)::int from public.notificacoes
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0001'),
  2,
  'o retry NÃO incrementa agrupadas — o caminho agrupado também é idempotente'
);

select is(
  (select coalesce(sum(jsonb_array_length(itens)), 0)::int from public.notificacoes
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0001'),
  2,
  'o retry NÃO repete o item em itens'
);

-- ════════════════════════════════════════════════════════════
-- T2b — FALHA PARCIAL: o retry completa o que faltou (acção EMAIL)
-- ════════════════════════════════════════════════════════════
-- Este é o teste que justifica `do update` em vez de `do nothing` no insert de
-- `notifications`. Sem ele, a decisão mais carregada da migração estaria
-- assente só num comentário.
--
--   1.ª tentativa:  notifications ✓   queue ✗ (morreu aqui)
--   retry:          notifications —   queue DEVE acontecer
--
-- Desde a divisão de 2026-09-01, quem enfileira é `acao_tipo='email'` — não
-- uma notificação com `enviar_email` na config, que já não enfileira nada
-- (provado acima). Mesmos destinatários da regra de notificação, mesma
-- estratégia de cargo; muda só o tipo, e a config não precisa de
-- `enviar_email` porque o tipo já o diz.
--
-- Com `do nothing`, o `returning id into v_notification_id` devolvia NULL no
-- retry. O insert na fila do ramo do motorista está guardado por
-- `v_notification_id is not null`, e no laço geral a fila usa esse mesmo id
-- como chave estrangeira — em qualquer dos casos a linha em falta nunca mais
-- nascia. A fila ficava permanentemente incompleta e ninguém dava por isso.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-0000004d0003', '00000000-0000-0000-0000-0000000d0000',
   'teste.idem_seguro.email', 'Regra Seguro (email)', 'viatura.seguro_expirando', 'email',
   jsonb_build_object(
     'titulo', 'Seguro a expirar',
     'template_codigo', 'teste.idem.email',
     'destinatarios_estrategia', 'cargo',
     'destinatarios_cargo_ids', jsonb_build_array('00000000-0000-0000-0000-000000cd0001')));

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-00000c4d0004', '00000000-0000-0000-0000-0000004d0003',
   '00000000-0000-0000-0000-0000000d0000', 'viaturas', '00000000-0000-0000-0000-0000008d0001');

select public.execute_automation_runs();

select is(
  (select count(*)::int from public.notification_queue q
     join public.notifications n on n.id = q.notification_id
    where n.rule_run_id = '00000000-0000-0000-0000-00000c4d0004'),
  2,
  'uma regra de email enfileira um item por destinatário'
);

-- Apaga-se a linha de fila de UM destinatário para simular a morte a meio. A do
-- outro fica, e tem de continuar única — o retry não pode reparar um lado e
-- duplicar o outro.
delete from public.notification_queue q
 using public.notifications n
 where n.id = q.notification_id
   and n.rule_run_id = '00000000-0000-0000-0000-00000c4d0004'
   and q.destinatario = 'admin@idem.pt';

select is(
  (select count(*)::int from public.notification_queue q
     join public.notifications n on n.id = q.notification_id
    where n.rule_run_id = '00000000-0000-0000-0000-00000c4d0004'),
  1,
  'pré-condição: a fila ficou com um destinatário por enviar'
);

update public.automation_runs
   set status = 'pending', started_at = null, next_attempt_at = now()
 where id = '00000000-0000-0000-0000-00000c4d0004';

select public.execute_automation_runs();

select is(
  (select count(*)::int from public.notification_queue q
     join public.notifications n on n.id = q.notification_id
    where n.rule_run_id = '00000000-0000-0000-0000-00000c4d0004'
      and q.destinatario = 'admin@idem.pt'),
  1,
  'falha parcial: o retry recupera o notification_id e cria a linha de fila em falta'
);

select is(
  (select count(*)::int from public.notification_queue q
     join public.notifications n on n.id = q.notification_id
    where n.rule_run_id = '00000000-0000-0000-0000-00000c4d0004'),
  2,
  'falha parcial: o destinatário que já tinha fila não ganha uma segunda linha'
);

select is(
  (select count(*)::int from public.notifications
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0004'),
  2,
  'falha parcial: reparar a fila não cria notifications novas'
);

-- ════════════════════════════════════════════════════════════
-- T4 — mesmo agrupamento ≠ mesmo efeito
-- ════════════════════════════════════════════════════════════
-- Run B é outra viatura, mesma regra, mesmo destinatário, mesmo dia: agrupa na
-- linha do run A, como sempre agrupou. A idempotência não pode matar isto.
insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-00000c4d0002', '00000000-0000-0000-0000-0000004d0001',
   '00000000-0000-0000-0000-0000000d0000', 'viaturas', '00000000-0000-0000-0000-0000008d0002');

select public.execute_automation_runs();

select is(
  (select agrupadas::int from public.notificacoes
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0001'
      and destinatario_id = '00000000-0000-0000-0000-0000000d0001'),
  2,
  'um run DIFERENTE continua a poder contribuir para o mesmo agrupamento'
);

select is(
  (select jsonb_array_length(itens)::int from public.notificacoes
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0001'
      and destinatario_id = '00000000-0000-0000-0000-0000000d0001'),
  2,
  'os dois itens — um por run — estão presentes'
);

select is(
  (select count(*)::int from public.notificacoes
    where destinatario_id = '00000000-0000-0000-0000-0000000d0001'
      and tipo = 'viatura_seguro_expirando'),
  1,
  'o run B fundiu-se na linha existente em vez de criar outra'
);

-- Retry do run B: o caso mais difícil. A contribuição do run B não tem linha
-- própria — vive dentro de `itens` da linha do run A. É lá que a regra nova a
-- vai procurar.
update public.automation_runs
   set status = 'pending', started_at = null, next_attempt_at = now()
 where id = '00000000-0000-0000-0000-00000c4d0002';

select public.execute_automation_runs();

select is(
  (select agrupadas::int from public.notificacoes
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0001'
      and destinatario_id = '00000000-0000-0000-0000-0000000d0001'),
  2,
  'o retry de um run já fundido não volta a incrementar agrupadas'
);

select is(
  (select jsonb_array_length(itens)::int from public.notificacoes
    where rule_run_id = '00000000-0000-0000-0000-00000c4d0001'
      and destinatario_id = '00000000-0000-0000-0000-0000000d0001'),
  2,
  'o retry de um run já fundido não volta a acrescentar o item'
);

-- ════════════════════════════════════════════════════════════
-- T6 — o que NÃO vem do motor fica intocado
-- ════════════════════════════════════════════════════════════
-- Os índices são PARCIAIS (`where rule_run_id is not null`) precisamente para
-- isto. Alertas directos, escalonamentos e o que o frontend escreve não têm
-- run, e duas linhas iguais para a mesma pessoa continuam a ser legítimas.
--
-- `severidade = 'urgente'` é o que impede o agrupamento de as fundir e assim
-- esconder o que se quer medir: aqui interessa saber que o ÍNDICE as deixa
-- passar, não o trigger.
--
-- `escalonamento` não é um nome à escolha: `notificacoes_tipo_check` é uma
-- lista fechada de 25 valores e um tipo inventado rebenta o insert. É também o
-- caso certo — um escalonamento é precisamente um alerta que não vem do motor.
insert into public.notificacoes (org_id, tipo, titulo, severidade, destinatario_id) values
  ('00000000-0000-0000-0000-0000000d0000', 'escalonamento', 'Alerta directo 1', 'urgente', '00000000-0000-0000-0000-0000000d0002'),
  ('00000000-0000-0000-0000-0000000d0000', 'escalonamento', 'Alerta directo 2', 'urgente', '00000000-0000-0000-0000-0000000d0002');

select is(
  (select count(*)::int from public.notificacoes
    where tipo = 'escalonamento' and rule_run_id is null),
  2,
  'notificacoes sem rule_run_id não são afectadas pelo índice parcial'
);

insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo) values
  ('00000000-0000-0000-0000-0000000d0000', '00000000-0000-0000-0000-0000000d0002', 'teste.sem_run', 'Directa 1'),
  ('00000000-0000-0000-0000-0000000d0000', '00000000-0000-0000-0000-0000000d0002', 'teste.sem_run', 'Directa 2');

select is(
  (select count(*)::int from public.notifications
    where template_codigo = 'teste.sem_run' and rule_run_id is null),
  2,
  'notifications sem rule_run_id coexistem para o mesmo destinatário'
);

-- ════════════════════════════════════════════════════════════
-- T7 — a fila: mesma chave é rejeitada, canal diferente não
-- ════════════════════════════════════════════════════════════
-- Esta é a única asserção do ficheiro que observa a rejeição do BANCO em vez
-- do resultado silencioso do `on conflict`. 23505 = unique_violation. É o que
-- prova que a garantia não depende de um `if not exists` no plpgsql — e por
-- isso é a que continua a valer com dois workers em paralelo.
-- Usa run E (a regra de email): é onde há efectivamente fila para tentar
-- duplicar — run A (notificação) já provou acima que nunca enfileira.
select throws_ok(
  $$insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo)
    select q.notification_id, q.org_id, q.canal, q.destinatario, q.template_codigo
      from public.notification_queue q
      join public.notifications n on n.id = q.notification_id
     where n.rule_run_id = '00000000-0000-0000-0000-00000c4d0004'
       and n.destinatario_user_id = '00000000-0000-0000-0000-0000000d0001'$$,
  '23505',
  null,
  'a mesma (notification_id, canal, destinatario) é rejeitada pelo banco'
);

-- A mesma notificação pode legitimamente sair por mais do que um canal.
insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo)
select q.notification_id, q.org_id, 'sms', q.destinatario, q.template_codigo
  from public.notification_queue q
  join public.notifications n on n.id = q.notification_id
 where n.rule_run_id = '00000000-0000-0000-0000-00000c4d0004'
   and n.destinatario_user_id = '00000000-0000-0000-0000-0000000d0001'
   and q.canal = 'email';

select is(
  (select count(*)::int from public.notification_queue q
     join public.notifications n on n.id = q.notification_id
    where n.rule_run_id = '00000000-0000-0000-0000-00000c4d0004'
      and n.destinatario_user_id = '00000000-0000-0000-0000-0000000d0001'),
  2,
  'canal diferente para a mesma notificação continua a ser permitido'
);

-- ════════════════════════════════════════════════════════════
-- T8 — o segundo produtor da fila continua vivo
-- ════════════════════════════════════════════════════════════
-- `notification_queue` tem quatro produtores: execute_automation_runs,
-- enviar_digests_diarios, fn_ticket_avisa_gestor_contrato e
-- handle_failed_job_notify. Os três últimos criam sempre uma `notifications`
-- nova e enfileiram uma linha para ela, portanto o `notification_id` é único
-- por construção e o índice novo nunca lhes toca. O digest é o que corre com
-- mais frequência e o único que agrega — é o que se verifica aqui.
--
-- `event_type` diferente de propósito: outro `tipo_legado`, para não mexer nas
-- contagens de agrupamento acima.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-0000004d0002', '00000000-0000-0000-0000-0000000d0000',
   'teste.idem_digest', 'Regra Digest', 'viatura.inspecao_expirando', 'notificacao',
   jsonb_build_object(
     'titulo', 'Inspecao a expirar',
     'template_codigo', 'teste.idem_digest',
     'destinatarios_estrategia', 'cargo',
     'destinatarios_cargo_ids', jsonb_build_array('00000000-0000-0000-0000-000000cd0001'),
     'enviar_email', true,
     'enviar_email_digest', true));

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-00000c4d0003', '00000000-0000-0000-0000-0000004d0002',
   '00000000-0000-0000-0000-0000000d0000', 'viaturas', '00000000-0000-0000-0000-0000008d0001');

select public.execute_automation_runs();
select public.enviar_digests_diarios();

select is(
  (select count(*)::int from public.notification_queue
    where template_codigo = 'digest.resumo_diario'),
  2,
  'o digest continua a enfileirar — um por destinatário — com o índice novo'
);

-- E não duplica quando volta a correr: o guarda é `digest_enviado_em`, que o
-- índice novo não toca. Confirma que a Fase 2 não substituiu por acidente uma
-- deduplicação que já existia.
select public.enviar_digests_diarios();

select is(
  (select count(*)::int from public.notification_queue
    where template_codigo = 'digest.resumo_diario'),
  2,
  'uma segunda passagem do digest não enfileira nada de novo'
);

-- ════════════════════════════════════════════════════════════
-- T9 — o emitter que duplicava dentro da própria instrução
-- ════════════════════════════════════════════════════════════
-- `emit_reservas_sem_checkin_events` fazia `join public.calendario_eventos`.
-- Um contrato com dois eventos por realizar — uma recolha e uma devolução, que
-- é a combinação normal — produzia DUAS linhas para o mesmo contrato na mesma
-- instrução, e o `not exists` não as via uma à outra: é avaliado contra a
-- tabela tal como estava antes de a instrução começar.
--
-- Em produção: 36 grupos duplicados em 17 313 eventos, todos deste event_type,
-- todos com intervalo de 00:00:00 entre as linhas — a mesma instrução, não dois
-- ciclos de cron sobrepostos.
--
-- O segundo evento de calendário é inserido À MÃO de propósito. O que a
-- cascata do contrato cria sozinha varia com a configuração; o que se quer
-- medir aqui é «dois eventos por realizar produzem UM evento de domínio», e
-- isso tem de ser verdade independentemente de quantos a cascata criou.
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-0000008d0003', '00000000-0000-0000-0000-0000000d0000', 'ID-03-EM',
   '00000000-0000-0000-0000-00008a4d0001', '00000000-0000-0000-0000-00008e4d0001');

insert into public.clientes (id, org_id, codigo, nome) values
  ('00000000-0000-0000-0000-0000000d0050', '00000000-0000-0000-0000-0000000d0000', 994001, 'Cliente Idem');

insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id) values
  ('00000000-0000-0000-0000-0000000d0060', '00000000-0000-0000-0000-0000000d0000', 994001,
   now() - interval '3 days', '00000000-0000-0000-0000-0000008d0003', '00000000-0000-0000-0000-0000000d0050');

insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim, tarifa_diaria, created_by)
values (
  '00000000-0000-0000-0000-0000000d0070', '00000000-0000-0000-0000-0000000d0000', 994001,
  '00000000-0000-0000-0000-0000000d0060', '00000000-0000-0000-0000-0000000d0050',
  '00000000-0000-0000-0000-0000008d0003', 'ID-03-EM',
  now() - interval '3 days', now() - interval '1 day', 35, '00000000-0000-0000-0000-0000000d0001');

update public.contratos_renting set estado_operacional = 'em_curso'
 where id = '00000000-0000-0000-0000-0000000d0070';

insert into public.calendario_eventos (id, org_id, titulo, tipo, data_inicio, criado_por, origem_tipo, origem_id) values
  ('00000000-0000-0000-0000-0000000d0080', '00000000-0000-0000-0000-0000000d0000',
   'Devolucao Idem', 'devolucao', now() - interval '1 day',
   '00000000-0000-0000-0000-0000000d0001', 'contrato_renting', '00000000-0000-0000-0000-0000000d0070'),
  ('00000000-0000-0000-0000-0000000d0081', '00000000-0000-0000-0000-0000000d0000',
   'Recolha Idem', 'recolha', now() - interval '1 day',
   '00000000-0000-0000-0000-0000000d0001', 'contrato_renting', '00000000-0000-0000-0000-0000000d0070');

-- Pré-condição: sem pelo menos dois eventos por realizar, a asserção seguinte
-- passaria por não haver nada para duplicar — e não provaria nada.
select cmp_ok(
  (select count(*)::int from public.calendario_eventos
    where origem_tipo = 'contrato_renting'
      and origem_id = '00000000-0000-0000-0000-0000000d0070'
      and tipo in ('recolha', 'devolucao', 'troca')
      and realizado_em is null),
  '>=',
  2,
  'o contrato tem pelo menos dois eventos de calendário por realizar'
);

select public.emit_reservas_sem_checkin_events();

select is(
  (select count(*)::int from public.domain_events
    where entity_table = 'contratos_renting'
      and entity_id = '00000000-0000-0000-0000-0000000d0070'
      and event_type = 'contrato_renting.sem_checkin'),
  1,
  'dois eventos de calendário por realizar produzem UM evento de domínio, não dois'
);

select * from finish();
rollback;
