-- Motor de Automação — views de leitura para o dashboard admin
-- reorganizado em tabs. security_invoker garante que a RLS das tabelas
-- subjacentes continua a aplicar-se a quem consulta a view (Postgres 17).
-- Ver docs/superpowers/plans/2026-07-27-automacao-dashboard-redesign.md.

create view public.automacao_timeline_recente
with (security_invoker = true) as
select
  de.id as event_id,
  de.org_id,
  de.event_type,
  de.occurred_at,
  de.entity_table,
  de.entity_id,
  ar.id as run_id,
  ar.rule_id,
  aru.nome as regra_nome,
  ar.status as run_status,
  ar.started_at,
  ar.completed_at,
  ar.attempt,
  al.evento as ultimo_evento_log,
  al.duracao_ms,
  al.detalhe
from public.domain_events de
left join public.automation_runs ar on ar.trigger_event_id = de.id
left join public.automation_rules aru on aru.id = ar.rule_id
left join lateral (
  select l.evento, l.duracao_ms, l.detalhe, l.created_at
  from public.automation_logs l
  where l.run_id = ar.id
  order by l.created_at desc
  limit 1
) al on true
order by de.occurred_at desc;

comment on view public.automacao_timeline_recente is 'Uma linha por (evento, run) para a tab Atividade do dashboard admin — junta Event Bus + Rule Engine + último log conhecido.';

create view public.automacao_estatisticas_por_regra
with (security_invoker = true) as
select
  aru.id as rule_id,
  aru.org_id,
  aru.nome,
  aru.event_type,
  aru.ativo,
  aru.cooldown_minutos,
  count(al.id) filter (where al.evento = 'executada') as execucoes,
  count(al.id) filter (where al.evento = 'falhou') as falhas,
  max(al.created_at) as ultima_execucao,
  avg(al.duracao_ms) filter (where al.evento = 'executada') as duracao_media_ms
from public.automation_rules aru
left join public.automation_logs al on al.rule_id = aru.id
group by aru.id, aru.org_id, aru.nome, aru.event_type, aru.ativo, aru.cooldown_minutos;

comment on view public.automacao_estatisticas_por_regra is 'Agregado vitalício por regra para a tab Regras — execuções, falhas, última execução, duração média.';
