-- ============================================================
-- Fix: recursos invisíveis/partidos no editor "Permissões por Módulo"
-- ============================================================
-- O editor (PermissionsSelector) agrupa recursos por categoria com
-- match EXATO contra a lista estática MODULOS. Três problemas:
--
-- 1. renting_ver_todos tinha categoria 'renting' (minúscula) ≠ módulo
--    'Renting' → nunca aparecia no editor; a permissão "ver todos os
--    contratos/reservas" só era concedível por SQL à mão.
--
-- 2. dashboard_checkin_historico é verificado no Dashboard
--    (hasPermission em Dashboard.tsx) mas nunca foi inserido em
--    recursos → check falhava sempre para não-admins e o módulo
--    Dashboard nem renderizava no editor (zero recursos).
--
-- 3. Linha lixo nome='Gerir Convites' (display label em vez de slug),
--    duplicado de admin_convites — aparecia como entrada duplicada no
--    editor; concedê-la não fazia nada (nenhum código verifica esse
--    nome). Delete cascada para cargo_permissoes (1 grant morto).
-- ============================================================

UPDATE public.recursos
   SET categoria = 'Renting'
 WHERE nome = 'renting_ver_todos'
   AND categoria = 'renting';

INSERT INTO public.recursos (nome, descricao, categoria)
VALUES (
  'dashboard_checkin_historico',
  'Ver o histórico de check-ins no Dashboard',
  'Dashboard'
)
ON CONFLICT (nome) DO NOTHING;

DELETE FROM public.recursos
 WHERE nome = 'Gerir Convites';
