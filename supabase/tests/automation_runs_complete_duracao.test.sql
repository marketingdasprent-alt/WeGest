begin;
select plan(8);

select has_function('public', 'automation_runs_complete', array['uuid', 'jsonb'], 'automation_runs_complete(uuid, jsonb) existe');
select has_function('public', 'automation_runs_fail', array['uuid', 'text'], 'automation_runs_fail existe');

-- Fixture: org, regra, run em execução há 2 segundos.
insert into public.organizacoes (id, nome) values ('11111111-1111-1111-1111-111111111111', 'Org Teste Duração');
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'teste.duracao', 'Regra Teste', 'teste.evento', 'notificacao', '{}'::jsonb);
insert into public.automation_runs (id, rule_id, org_id, status, started_at)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'running', now() - interval '2 seconds');

select public.automation_runs_complete('33333333-3333-3333-3333-333333333333', '{"notificacoes_criadas": 3, "emails_enviados": 1}'::jsonb);

select ok(
  (select duracao_ms from public.automation_logs where run_id = '33333333-3333-3333-3333-333333333333' and evento = 'executada') >= 2000,
  'duracao_ms reflete o tempo real desde started_at'
);
select is(
  (select detalhe->>'notificacoes_criadas' from public.automation_logs where run_id = '33333333-3333-3333-3333-333333333333' and evento = 'executada'),
  '3',
  'detalhe.notificacoes_criadas é gravado'
);
select is(
  (select detalhe->>'emails_enviados' from public.automation_logs where run_id = '33333333-3333-3333-3333-333333333333' and evento = 'executada'),
  '1',
  'detalhe.emails_enviados é gravado'
);

-- Segundo run: falha definitiva (attempt >= max_attempts) grava duracao_ms.
insert into public.automation_runs (id, rule_id, org_id, status, started_at, attempt, max_attempts)
values ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'running', now() - interval '1 second', 3, 3);
select public.automation_runs_fail('44444444-4444-4444-4444-444444444444', 'erro definitivo');
select ok(
  (select duracao_ms from public.automation_logs where run_id = '44444444-4444-4444-4444-444444444444' and evento = 'falhou') is not null,
  'falha definitiva grava duracao_ms'
);

-- Terceiro run: falha com retry (attempt < max_attempts) NÃO grava duracao_ms.
insert into public.automation_runs (id, rule_id, org_id, status, started_at, attempt, max_attempts)
values ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'running', now(), 0, 3);
select public.automation_runs_fail('55555555-5555-5555-5555-555555555555', 'erro temporário');
select is(
  (select duracao_ms from public.automation_logs where run_id = '55555555-5555-5555-5555-555555555555' and evento = 'falhou'),
  null,
  'retry intermédio não grava duracao_ms (execução ainda não terminou)'
);

select is(
  (select status from public.automation_runs where id = '33333333-3333-3333-3333-333333333333'),
  'completed',
  'run principal fica completed'
);

select * from finish();
rollback;
