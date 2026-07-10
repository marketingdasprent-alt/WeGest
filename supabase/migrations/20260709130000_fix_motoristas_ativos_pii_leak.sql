-- ============================================================
-- Fix: "Financeiro pode ver motoristas_ativos_total" era PERMISSIVE +
-- SELECT + qual=true, sem nenhum check de permissão. Como policies
-- PERMISSIVE fazem OR entre si, qualquer utilizador autenticado da org
-- (não só quem tem 'financeiro_recibos') conseguia ler a tabela toda de
-- motoristas — NIF, IBAN, telefone, morada, nº de carta/TVDE — mesmo
-- sem nenhuma permissão atribuída. A RESTRICTIVE rls_org_isolation só
-- limita por org, não por permissão, por isso não bloqueava isto.
--
-- mt_motoristas_ativos_select já cobre o caso legítimo do Financeiro via
-- has_permission(auth.uid(), 'financeiro_recibos') — a policy solta é
-- puro risco redundante, mesma classe do bug já corrigido em
-- public.cargos (20260709120000_fix_cargos_non_admin_write_gap.sql).
-- ============================================================

DROP POLICY IF EXISTS "Financeiro pode ver motoristas_ativos_total" ON public.motoristas_ativos;
