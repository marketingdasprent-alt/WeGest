-- O sino lê notificacoes de 20 em 20 s por separador e era a consulta com mais
-- tempo de CPU (15,9 %, ~98 ms e ~4 900 blocos por chamada). As funções da RLS são
-- SECURITY DEFINER, não se expandem, e corriam uma vez por linha. Em (select ...)
-- o Postgres avalia-as uma vez por consulta. Mesmo resultado: são STABLE, sem
-- argumentos da linha, e auth.uid() não muda dentro da consulta.
-- Nomes, papéis e RESTRICTIVE/PERMISSIVE ficam iguais (ALTER POLICY só troca a expressão).

ALTER POLICY rls_org_isolation ON public.notificacoes
  USING (org_id = (SELECT public.get_current_org_id()))
  WITH CHECK (org_id = (SELECT public.get_current_org_id()));

ALTER POLICY "ver notificacoes do meu cargo" ON public.notificacoes USING (
  (org_id = (SELECT public.get_current_org_id()))
  AND (
    (
      (tipo = ANY (ARRAY['motorista_pendente'::text, 'motorista_documento_pendente'::text]))
      AND ((SELECT public.is_current_user_admin())
           OR (SELECT public.current_user_tem_cargo(ARRAY['Gestor TVDE'::text, 'Administrador'::text, 'Supervisor Gestor TVDE'::text])))
    )
    OR (
      (tipo = ANY (ARRAY['escalonamento'::text, 'pedido_troca_kms'::text]))
      AND ((SELECT public.is_current_user_admin())
           OR (SELECT public.current_user_tem_cargo(ARRAY['Supervisor Gestor TVDE'::text])))
    )
    OR (
      (tipo <> ALL (ARRAY['motorista_pendente'::text, 'motorista_documento_pendente'::text,
                          'escalonamento'::text, 'pedido_troca_kms'::text]))
      AND (destinatario_id = (SELECT auth.uid()))
    )
  )
);

NOTIFY pgrst, 'reload schema';
