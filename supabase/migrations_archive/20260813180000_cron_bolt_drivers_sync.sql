-- ============================================================
-- Cron: refrescar a lista de motoristas da Bolt antes do sync
-- ============================================================
-- bolt_drivers.status é a fonte que decide qual uuid vai para a ficha
-- (ver 20260813170000). Tem de estar fresca ANTES do sync semanal, senão a
-- ficha segue um 'active' que entretanto mudou — o motorista saiu, o uuid
-- passou a 'deactivated' e nós continuávamos a apontar para ele.
--
-- 05:30 de segunda: meia hora antes do bolt-weekly-enqueue (06:00, jobid 69).
-- Repete à quinta, a par da passagem de reconciliação (jobid 70), porque a
-- Bolt revê tarifas depois do fecho da semana e entretanto há altas e baixas.
-- ============================================================

SELECT cron.schedule(
  'bolt-drivers-sync-semanal',
  '30 5 * * 1',
  $$ SELECT public.cron_invocar_edge('bolt-drivers-sync-semanal', 'bolt-drivers-sync', '{}'::jsonb, 150000) $$
);

SELECT cron.schedule(
  'bolt-drivers-sync-reconciliacao',
  '30 5 * * 4',
  $$ SELECT public.cron_invocar_edge('bolt-drivers-sync-reconciliacao', 'bolt-drivers-sync', '{}'::jsonb, 150000) $$
);
