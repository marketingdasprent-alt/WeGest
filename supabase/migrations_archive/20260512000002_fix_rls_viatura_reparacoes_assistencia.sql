-- Fix: gestores de assistência não conseguiam atualizar viatura_reparacoes nem motorista_financeiro
-- A migration 20260424 corrigiu SELECT e INSERT mas esqueceu os UPDATEs.
-- Sem UPDATE, o modo de edição de tickets falha silenciosamente (RLS não retorna erro).

DROP POLICY IF EXISTS "Permissão para editar viatura_reparacoes" ON public.viatura_reparacoes;
CREATE POLICY "Permissão para editar viatura_reparacoes" ON public.viatura_reparacoes
  FOR UPDATE USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
  );

DROP POLICY IF EXISTS "Permissão para editar motorista_financeiro" ON public.motorista_financeiro;
CREATE POLICY "Permissão para editar motorista_financeiro" ON public.motorista_financeiro
  FOR UPDATE USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
  );
