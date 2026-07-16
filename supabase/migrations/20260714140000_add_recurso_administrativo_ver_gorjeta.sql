-- ============================================================
-- Recurso RBAC para a coluna "Gorjeta" em ContasResumoTab
-- ============================================================
-- Substitui o gate anterior, hardcoded a um org_id específico
-- (ContasResumoTab.tsx:43, DECADA_OUSADA_ORG_ID), por um recurso RBAC
-- normal — qualquer org do SaaS pode agora conceder isto aos seus
-- próprios admins/cargos, em vez de só uma organização estar cablada
-- no código. isAdmin continua a dar bypass automático (ver
-- PermissionsContext.tsx), por isso nenhum INSERT em cargo_permissoes
-- é necessário aqui para não regredir o acesso actual dos admins.
-- ============================================================

INSERT INTO public.recursos (nome, categoria, descricao)
SELECT
  'administrativo_ver_gorjeta',
  'Administrativo',
  'Ver a coluna de gorjeta no resumo financeiro dos motoristas'
WHERE NOT EXISTS (
  SELECT 1 FROM public.recursos WHERE nome = 'administrativo_ver_gorjeta'
);
