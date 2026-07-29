begin;
select plan(10);

select has_view('public', 'automacao_timeline_recente', 'view automacao_timeline_recente existe');
select has_view('public', 'automacao_estatisticas_por_regra', 'view automacao_estatisticas_por_regra existe');

insert into public.organizacoes (id, nome) values ('66666666-6666-6666-6666-666666666666', 'Org Teste Views');
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config, ativo)
values ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 'teste.views', 'Regra Views', 'teste.evento', 'notificacao', '{}'::jsonb, true);
insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by)
values ('88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', 'teste.evento', 'viaturas', gen_random_uuid(), 'manual');
insert into public.automation_runs (id, rule_id, org_id, trigger_event_id, status, started_at, completed_at)
values ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', '88888888-8888-8888-8888-888888888888', 'completed', now() - interval '3 seconds', now());
insert into public.automation_logs (run_id, rule_id, org_id, evento, duracao_ms, detalhe)
values ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 'executada', 3000, '{"notificacoes_criadas": 2}'::jsonb);

select is(
  (select regra_nome from public.automacao_timeline_recente where event_id = '88888888-8888-8888-8888-888888888888'),
  'Regra Views',
  'timeline junta o nome da regra via automation_runs.rule_id'
);
select is(
  (select run_status from public.automacao_timeline_recente where event_id = '88888888-8888-8888-8888-888888888888'),
  'completed',
  'timeline mostra o estado do run'
);
select is(
  (select ultimo_evento_log from public.automacao_timeline_recente where event_id = '88888888-8888-8888-8888-888888888888'),
  'executada',
  'timeline mostra o último log conhecido'
);
select is(
  ((select detalhe from public.automacao_timeline_recente where event_id = '88888888-8888-8888-8888-888888888888')->>'notificacoes_criadas'),
  '2',
  'timeline expõe o detalhe jsonb do log'
);

select is(
  (select execucoes from public.automacao_estatisticas_por_regra where rule_id = '77777777-7777-7777-7777-777777777777'),
  1::bigint,
  'estatísticas contam 1 execução'
);
select is(
  (select duracao_media_ms from public.automacao_estatisticas_por_regra where rule_id = '77777777-7777-7777-7777-777777777777'),
  3000::numeric,
  'estatísticas calculam a duração média'
);

-- Evento sem run associado ainda aparece na timeline (left join).
insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'teste.sem_run', 'viaturas', gen_random_uuid(), 'manual');
select ok(
  (select run_id from public.automacao_timeline_recente where event_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is null,
  'evento sem automation_run associado aparece com run_id nulo, não desaparece'
);

select * from finish();
rollback;
