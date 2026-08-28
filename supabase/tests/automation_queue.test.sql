-- ============================================================
-- Motor de Automação — fila de execução (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- O isolamento multi-tenant (RLS) já é coberto por rls_org_isolation.test.sql
-- (META, genérico) e por automation_rules.test.sql (COMPORTAMENTO, para
-- domain_events/automation_rules). Este ficheiro assume a role por-omissão
-- da transação de teste (equivalente ao service_role que o Automation
-- Executor vai usar em produção) e cobre exclusivamente a FILA:
-- claim atómico, um run ativo por regra+ENTIDADE (não por org — duas
-- entidades diferentes podem ter runs ativos em simultâneo para a mesma
-- regra), retry com backoff, dead-letter ao esgotar tentativas, sweep de
-- runs presos em "running", e que automation_logs regista cada
-- execução/falha.
-- ============================================================

begin;
select plan(14);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org A', 'automacao-queue-a'),
  ('00000000-0000-0000-0000-0000000b0000', 'Org B', 'automacao-queue-b');

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-0000004c1e01', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_a', 'Regra A', 'teste.evento', 'notificacao', '{"template_codigo":"teste.template","titulo":"Titulo de Teste"}'::jsonb),
  ('00000000-0000-0000-0000-0000004c1e02', '00000000-0000-0000-0000-0000000b0000', 'teste.regra_b', 'Regra B', 'teste.evento', 'notificacao', '{"template_codigo":"teste.template","titulo":"Titulo de Teste"}'::jsonb);

-- Run principal: só 2 tentativas permitidas, para forçar o dead-letter cedo.
insert into public.automation_runs (id, rule_id, org_id, job_type, max_attempts, entity_table, entity_id) values
  ('00000000-0000-0000-0000-0000004c2e01', '00000000-0000-0000-0000-0000004c1e01', '00000000-0000-0000-0000-0000000a0000', 'automation_rule', 2, 'viaturas', '00000000-0000-0000-0000-00000ef70001');

-- 1. O índice único parcial impede um segundo run ativo para a mesma regra+entidade.
select throws_ok(
  $$ insert into public.automation_runs (rule_id, org_id, job_type, entity_table, entity_id)
     values ('00000000-0000-0000-0000-0000004c1e01', '00000000-0000-0000-0000-0000000a0000', 'automation_rule', 'viaturas', '00000000-0000-0000-0000-00000ef70001') $$,
  '23505',
  null,
  'não é possível ter dois automation_runs ativos para a mesma regra na mesma entidade'
);

-- 1b. Mas uma entidade DIFERENTE para a mesma regra não entra em conflito
-- (a correção: a unicidade é por regra+entidade, não por regra+org).
insert into public.automation_runs (id, rule_id, org_id, job_type, entity_table, entity_id) values
  ('00000000-0000-0000-0000-0000004c5e01', '00000000-0000-0000-0000-0000004c1e01', '00000000-0000-0000-0000-0000000a0000', 'automation_rule', 'viaturas', '00000000-0000-0000-0000-00000ef70002');

select is(
  (select count(*)::int from public.automation_runs where id = '00000000-0000-0000-0000-0000004c5e01'),
  1,
  'uma entidade diferente para a mesma regra não entra em conflito com o índice único'
);

delete from public.automation_runs where id = '00000000-0000-0000-0000-0000004c5e01';

-- 2. claim() devolve o run pendente.
select is(
  (select count(*)::int from public.automation_runs_claim(10)),
  1,
  'claim() devolve o run pendente'
);

-- 3. claim() marca o run como running.
select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-0000004c2e01'),
  'running',
  'claim() marca o run como running'
);

-- 4. claim() incrementa attempt.
select is(
  (select attempt::int from public.automation_runs where id = '00000000-0000-0000-0000-0000004c2e01'),
  1,
  'claim() incrementa attempt para 1'
);

-- 5. claim() não devolve o mesmo run outra vez enquanto está running.
select is(
  (select count(*)::int from public.automation_runs_claim(10)),
  0,
  'claim() não devolve o mesmo run duas vezes seguidas'
);

-- 6. Falha com tentativas restantes (attempt=1 < max_attempts=2): volta a pending.
select public.automation_runs_fail('00000000-0000-0000-0000-0000004c2e01', 'erro de teste 1');

select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-0000004c2e01'),
  'pending',
  'falha com tentativas restantes volta a pending'
);

-- 7. ...com o próximo attempt agendado no futuro (backoff).
select ok(
  (select next_attempt_at > now() from public.automation_runs where id = '00000000-0000-0000-0000-0000004c2e01'),
  'falha com tentativas restantes agenda o próximo attempt no futuro (backoff)'
);

-- 8. Forçar disponibilidade e esgotar max_attempts=2 na segunda falha.
update public.automation_runs set next_attempt_at = now() where id = '00000000-0000-0000-0000-0000004c2e01';
select public.automation_runs_claim(10);
select public.automation_runs_fail('00000000-0000-0000-0000-0000004c2e01', 'erro de teste 2');

select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-0000004c2e01'),
  'failed',
  'segunda falha esgota max_attempts e fica failed (terminal, dead-letter)'
);

-- 9. Dead-letter grava uma linha em failed_jobs.
select is(
  (select count(*)::int from public.failed_jobs where source_id = '00000000-0000-0000-0000-0000004c2e01'),
  1,
  'esgotar as tentativas grava uma linha em failed_jobs'
);

-- 10. Cada chamada a automation_runs_fail() regista uma linha em automation_logs.
select is(
  (select count(*)::int from public.automation_logs where run_id = '00000000-0000-0000-0000-0000004c2e01' and evento = 'falhou'),
  2,
  'cada chamada a automation_runs_fail() regista uma linha em automation_logs'
);

-- 11. Sweep: run preso em "running" há mais de 15 minutos é marcado failed.
insert into public.automation_runs (id, rule_id, org_id, status, started_at) values
  ('00000000-0000-0000-0000-0000004c3e01', '00000000-0000-0000-0000-0000004c1e02', '00000000-0000-0000-0000-0000000b0000', 'running', now() - interval '20 minutes');

select public.automation_runs_claim(10);

select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-0000004c3e01'),
  'failed',
  'claim() varre e falha runs presos em running há mais de 15 minutos'
);

-- 12/13. Caminho feliz: claim() + complete() marca completed e regista em automation_logs.
-- (Válido agora: ru2e01 já está 'failed', portanto já não ocupa o índice único de ru1e01/Org A.)
insert into public.automation_runs (id, rule_id, org_id) values
  ('00000000-0000-0000-0000-0000004c4e01', '00000000-0000-0000-0000-0000004c1e01', '00000000-0000-0000-0000-0000000a0000');

select public.automation_runs_claim(10);
select public.automation_runs_complete('00000000-0000-0000-0000-0000004c4e01');

select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-0000004c4e01'),
  'completed',
  'complete() marca o run como completed'
);

select is(
  (select count(*)::int from public.automation_logs where run_id = '00000000-0000-0000-0000-0000004c4e01' and evento = 'executada'),
  1,
  'complete() regista uma linha executada em automation_logs'
);

select * from finish();
rollback;
