-- Adiciona recurso de permissão para ver gestores nos relatórios de eventos.
-- Corrige a policy mt_profiles_select para permitir acesso a utilizadores
-- com esta permissão (além de admins), mantendo isolamento multi-tenant.

INSERT INTO public.recursos (nome, descricao, categoria)
VALUES (
  'calendario_ver_gestores',
  'Ver nomes dos gestores nos relatórios de eventos',
  'Calendário'
)
ON CONFLICT (nome) DO NOTHING;

DROP POLICY IF EXISTS "mt_profiles_select" ON public.profiles;

CREATE POLICY "mt_profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (org_id = get_current_org_id() AND (
      is_current_user_admin()
      OR has_permission(auth.uid(), 'admin_utilizadores')
      OR has_permission(auth.uid(), 'calendario_ver_gestores')
    ))
  );
