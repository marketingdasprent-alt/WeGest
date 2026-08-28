-- Motor de Automação — correção: o índice único original de
-- automation_runs (rule_id, org_id) impedia duas entidades diferentes
-- (ex.: dois veículos) de terem, em simultâneo, um run ativo para a
-- MESMA regra na mesma org. Descoberto ao construir o Rule Engine
-- (Sub-projeto 3), antes de existirem dados reais em produção.
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-rule-engine.md.

alter table public.automation_runs
  add column entity_table text,
  add column entity_id uuid;

drop index public.idx_automation_runs_one_active_per_rule;

create unique index idx_automation_runs_one_active_per_rule_entity
  on public.automation_runs (rule_id, entity_table, entity_id)
  where status in ('pending', 'running') and entity_id is not null;

comment on column public.automation_runs.entity_table is 'Copiado de domain_events.entity_table no momento da criação do run — usado pela unicidade por regra+entidade.';
comment on column public.automation_runs.entity_id is 'Copiado de domain_events.entity_id no momento da criação do run.';
