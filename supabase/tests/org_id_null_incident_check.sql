-- ============================================================
-- Verificação: org_id NULL nas tabelas com incidentes conhecidos
-- ============================================================
-- READ-ONLY. Resultado esperado: 0 linhas. Cobre os incidentes de
-- 2026-07-13/14 (cargo_permissoes, tabelas Uber) — ver
-- AUDITORIA_PRODUTO_2026-07-10.md, secção 5. Correr no SQL editor do
-- Supabase depois de aplicar 20260714150000 e 20260714160000.
-- ============================================================

select 'cargo_permissoes' as tabela, count(*) as linhas_org_id_null
from public.cargo_permissoes where org_id is null
having count(*) > 0

union all

select 'uber_transactions', count(*)
from public.uber_transactions where org_id is null
having count(*) > 0

union all

select 'uber_drivers', count(*)
from public.uber_drivers where org_id is null
having count(*) > 0

union all

select 'uber_sync_logs', count(*)
from public.uber_sync_logs where org_id is null
having count(*) > 0

union all

select 'uber_webhook_events', count(*)
from public.uber_webhook_events where org_id is null
having count(*) > 0;
