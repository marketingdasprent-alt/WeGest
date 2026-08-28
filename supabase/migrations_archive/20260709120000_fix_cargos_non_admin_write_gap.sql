-- ============================================================
-- Fix: cargos_org_isolation era PERMISSIVE + ALL + só filtro de
-- org_id, sem checar is_current_user_admin(). Como políticas
-- PERMISSIVE fazem OR entre si, qualquer membro autenticado da
-- org (não-admin) conseguia INSERT/UPDATE/DELETE em public.cargos
-- da própria org — apesar de "Apenas admins podem gerenciar
-- cargos" e "mt_cargos_all" exigirem admin. A RESTRICTIVE
-- rls_org_isolation só limita por org, não por admin, por isso
-- não bloqueava isto.
--
-- Fix: remover a policy solta. Ficam "Apenas admins podem
-- gerenciar cargos" (has_role legado) e "mt_cargos_all"
-- (org_id + is_current_user_admin()) como únicas policies de
-- escrita — ambas exigem admin — mais "Todos podem ver cargos" /
-- "mt_cargos_select" para leitura.
-- ============================================================

DROP POLICY IF EXISTS "cargos_org_isolation" ON public.cargos;
