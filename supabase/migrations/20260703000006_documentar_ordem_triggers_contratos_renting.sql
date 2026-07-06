-- ============================================================
-- Documentar dependência de ordem entre triggers de contratos_renting
-- ============================================================
-- Postgres executa triggers AFTER da mesma tabela/evento por ordem
-- ALFABÉTICA do nome — não há prioridade explícita. Isto é uma
-- dependência implícita e frágil: renomear um trigger reordena tudo
-- silenciosamente. Auditoria (2026-07-03) confirmou que a ordem ACTUAL
-- é segura (cada trigger lê apenas OLD/NEW da própria row, nenhum
-- depende de side-effects escritos por outro trigger na mesma
-- transacção), mas fica sem garantia formal. Este ficheiro só
-- documenta via COMMENT ON TRIGGER — não altera comportamento.
--
-- Ordem alfabética real em AFTER UPDATE OF viatura_id (a mais sensível,
-- disparada por trocas/upgrades/downgrades):
--   1. trg_contrato_renting_cascata_versao    — cria eventos calendário
--   2. trg_contrato_renting_liga_motorista_close (se aplicável)
--   3. trg_contrato_renting_liga_motorista_open  — sincroniza motorista_viaturas
--   4. trg_contratos_disponibilidade             — recalcula viaturas.status
--
-- Se um novo trigger AFTER UPDATE for adicionado a contratos_renting
-- e precisar de correr antes/depois de um destes, o nome tem de ser
-- escolhido a pensar na ordem alfabética resultante — não há outro
-- mecanismo de prioridade nesta versão do Postgres.
-- ============================================================

COMMENT ON TRIGGER trg_contrato_renting_cascata_versao ON public.contratos_renting IS
  'Ordem alfabética importa: corre ANTES de trg_contrato_renting_liga_motorista_open '
  'e trg_contratos_disponibilidade no mesmo UPDATE OF viatura_id (troca de viatura). '
  'Lê apenas OLD/NEW da própria row — não depende dos outros.';

COMMENT ON TRIGGER trg_contrato_renting_liga_motorista_open ON public.contratos_renting IS
  'Ordem alfabética importa: corre DEPOIS de trg_contrato_renting_cascata_versao e '
  'ANTES de trg_contratos_disponibilidade no mesmo UPDATE OF viatura_id. '
  'Sincroniza motorista_viaturas/motoristas_ativos.status_ativo.';

COMMENT ON TRIGGER trg_contrato_renting_liga_motorista_close ON public.contratos_renting IS
  'Ordem alfabética importa: corre DEPOIS de trg_contrato_renting_cascata_versao. '
  'Dispara em fecho/soft-delete/substituição (versionamento).';

COMMENT ON TRIGGER trg_contratos_disponibilidade ON public.contratos_renting IS
  'Deve correr POR ÚLTIMO entre os triggers de UPDATE OF viatura_id/estado_operacional '
  '— recalcula viaturas.status a partir do estado final da row após os outros triggers '
  'terem sincronizado motorista_viaturas/calendário.';
