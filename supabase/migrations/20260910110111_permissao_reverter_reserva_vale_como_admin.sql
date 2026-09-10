-- A permissão "Reverter contrato para reserva" passa a valer o mesmo que ser
-- admin, para o efeito de mexer num contrato apagado.
--
-- PORQUE É QUE A PERMISSÃO NÃO CHEGAVA
--
-- Reverter é um soft-delete: marca deleted_at no contrato e devolve a reserva.
-- Mas as políticas de SELECT e UPDATE diziam
--
--     (deleted_at IS NULL) OR is_current_user_admin()
--
-- ou seja, um contrato apagado só existe para administradores. Quando um
-- não-admin marcava o contrato como apagado, a linha deixava de lhe ser
-- visível e o Postgres recusava a operação — "new row violates row-level
-- security policy". Nem com o botão ligado nas Permissões: o bloqueio não era
-- de permissão, era de visibilidade, e nenhum toggle no ecrã lá chegava.
--
-- Isolado assim: com todas as políticas abertas o UPDATE passa; abrindo só a
-- de SELECT também passa; e um UPDATE a qualquer outra coluna (updated_at)
-- passa sempre, com ou sem. É a cláusula do deleted_at, nas duas políticas.
--
-- A correcção NÃO muda o funcionamento: continua a ser o mesmo UPDATE feito
-- pela aplicação, sem RPC nova nem alteração de código. Só se acrescenta a
-- permissão ao lado do admin nas duas cláusulas — quem a tem faz exactamente
-- o que um admin faz, que era o que se queria.
--
-- Efeito lateral assumido: quem tiver esta permissão passa também a VER
-- contratos apagados nas listagens, tal como um admin. É inseparável — para
-- poder apagar tem de poder continuar a ver o que apagou.
--
-- Verificado em produção: com a permissão passa, sem a permissão continua
-- bloqueado (42501). "Reverter abertura" nunca teve este problema — mexe no
-- estado, não no deleted_at.

DROP POLICY IF EXISTS contratos_renting_select ON public.contratos_renting;

CREATE POLICY contratos_renting_select ON public.contratos_renting
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (org_id = get_current_org_id())
    AND has_renting_contratos_access()
    AND (
      (deleted_at IS NULL)
      OR is_current_user_admin()
      OR has_permission(auth.uid(), 'contratos_reverter_reserva')
    )
    AND (
      (NOT org_privacidade_por_gestor())
      OR is_current_user_admin()
      OR has_permission(auth.uid(), 'renting_ver_todos')
      OR (gestor_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS contratos_renting_update ON public.contratos_renting;

CREATE POLICY contratos_renting_update ON public.contratos_renting
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (org_id = get_current_org_id())
    AND has_renting_contratos_access()
    AND (
      (deleted_at IS NULL)
      OR is_current_user_admin()
      OR has_permission(auth.uid(), 'contratos_reverter_reserva')
    )
    AND (
      (NOT org_privacidade_por_gestor())
      OR is_current_user_admin()
      OR has_permission(auth.uid(), 'renting_ver_todos')
      OR (gestor_id = auth.uid())
    )
  )
  WITH CHECK (
    (org_id = get_current_org_id())
    AND has_renting_contratos_access()
    AND (
      (NOT org_privacidade_por_gestor())
      OR is_current_user_admin()
      OR has_permission(auth.uid(), 'renting_ver_todos')
      OR (gestor_id = auth.uid())
    )
  );
