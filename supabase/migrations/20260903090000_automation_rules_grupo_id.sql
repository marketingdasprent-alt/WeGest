-- ============================================================================
-- automation_rules ganha grupo_id — várias linhas, a mesma automação
-- ============================================================================
--
-- Cada acção continua a ser a sua própria linha (zero mudanças no executor,
-- no validador, na resolução de destinatários — é o mesmo padrão das regras
-- gémeas da Fase 1, só que gerado pelo editor em vez de uma migração).
-- grupo_id é só quem diz "estas linhas são a mesma automação aos olhos do
-- utilizador".
-- ============================================================================

alter table public.automation_rules
  add column grupo_id uuid not null default gen_random_uuid();

create index idx_automation_rules_grupo on public.automation_rules (grupo_id);
