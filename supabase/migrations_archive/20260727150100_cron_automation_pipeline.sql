-- Motor de Automação — agenda o Rule Engine e o Automation Executor a
-- cada 5 minutos. Nenhum dos dois tinha cron ainda (Sub-projetos 3 e 6
-- só criaram as funções). emit_expiry_events() já tem o seu próprio
-- cron diário (Sub-projeto 2) — não é repetido aqui.
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-executor.md.

select cron.schedule(
  'automation-process-domain-events',
  '*/5 * * * *',
  $$select public.process_domain_events()$$
);

select cron.schedule(
  'automation-execute-runs',
  '*/5 * * * *',
  $$select public.execute_automation_runs()$$
);
