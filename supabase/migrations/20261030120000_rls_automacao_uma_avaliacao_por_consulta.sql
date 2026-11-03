-- A Monitorização da Automação dava 500 (statement timeout, 8 s) na Década Ousada:
-- automacao_timeline_recente e automacao_estatisticas_por_regra são security_invoker
-- e varrem ~56k eventos, ~49k logs e ~13k runs. Duas causas medidas a 30-10:
--
-- 1. A RLS chamava is_current_user_admin()/has_permission() uma vez por linha
--    (~90 µs cada; só contar os logs da Década levava 4,3 s). Em (select ...) o
--    Postgres avalia-as uma vez por consulta. Mesmo resultado: são STABLE, sem
--    argumentos da linha, e auth.uid() não muda dentro da consulta.
-- 2. Sem índice em automation_runs.trigger_event_id nem em automation_logs.run_id,
--    a timeline juntava eventos e runs por força bruta.
--
-- Nomes, papéis e RESTRICTIVE/PERMISSIVE ficam iguais (ALTER POLICY só troca a expressão).

CREATE INDEX IF NOT EXISTS idx_automation_runs_trigger_event
  ON public.automation_runs (trigger_event_id);

CREATE INDEX IF NOT EXISTS idx_automation_logs_run_created
  ON public.automation_logs (run_id, created_at DESC);

-- A timeline ordena por occurred_at dentro da org; o índice existente tem event_type no meio.
CREATE INDEX IF NOT EXISTS idx_domain_events_org_occurred
  ON public.domain_events (org_id, occurred_at DESC);

ALTER POLICY mt_domain_events_select ON public.domain_events USING (
  (SELECT public.is_current_user_admin())
  OR (SELECT public.has_permission((SELECT auth.uid()), 'automacoes'::text))
);

ALTER POLICY mt_automation_runs_select ON public.automation_runs USING (
  (SELECT public.is_current_user_admin())
  OR (SELECT public.has_permission((SELECT auth.uid()), 'automacoes'::text))
);

ALTER POLICY mt_automation_logs_select ON public.automation_logs USING (
  (SELECT public.is_current_user_admin())
  OR (SELECT public.has_permission((SELECT auth.uid()), 'automacoes'::text))
);

ALTER POLICY mt_automation_rules_select ON public.automation_rules USING (
  (SELECT public.is_current_user_admin())
  OR (SELECT public.has_permission((SELECT auth.uid()), 'automacoes'::text))
);

NOTIFY pgrst, 'reload schema';
