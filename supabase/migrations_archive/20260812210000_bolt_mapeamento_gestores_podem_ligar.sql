-- ============================================================
-- bolt_mapeamento_motoristas: quem pode LIGAR uma identidade
-- ============================================================
-- Defeito introduzido a 2026-08-12 comigo: o botão "Sincronizar
-- identidade" na ficha do motorista escreve nesta tabela, mas todas as
-- políticas de ESCRITA exigem `is_current_user_admin()`. Um gestor com
-- `motoristas_gestao` consegue VER o mapeamento e não consegue gravá-lo —
-- o botão rebentava com erro de permissão para toda a gente menos admins.
--
-- Ligar uma identidade de plataforma é trabalho corrente de quem gere
-- motoristas, não é administração do sistema. Quem já pode editar a ficha
-- do motorista pode ligar-lhe uma identidade.
--
-- Continua tudo fechado ao anónimo e isolado por organização — as
-- políticas RESTRICTIVE `rls_deny_anon` e `rls_org_isolation` mantêm-se
-- intactas e aplicam-se por cima desta.
-- ============================================================

DROP POLICY IF EXISTS "Gestores podem ligar identidades Bolt" ON public.bolt_mapeamento_motoristas;

CREATE POLICY "Gestores podem ligar identidades Bolt"
  ON public.bolt_mapeamento_motoristas
  FOR ALL
  TO authenticated
  USING (
    org_id = public.get_current_org_id()
    AND (public.is_current_user_admin() OR public.has_permission(auth.uid(), 'motoristas_gestao'))
  )
  WITH CHECK (
    org_id = public.get_current_org_id()
    AND (public.is_current_user_admin() OR public.has_permission(auth.uid(), 'motoristas_gestao'))
  );

COMMENT ON TABLE public.bolt_mapeamento_motoristas IS
  'Ligação uuid Bolt -> motorista WeGest. UNIQUE(driver_uuid): um uuid pertence '
  'a um motorista; um motorista pode ter N uuids (sai da frota e volta com outro, '
  'ou tem um por conta da frota). É a fonte de verdade do sync. '
  'Escrita: admins e quem tem motoristas_gestao, dentro da própria organização.';
