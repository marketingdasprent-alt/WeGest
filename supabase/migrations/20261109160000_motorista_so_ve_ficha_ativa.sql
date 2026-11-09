-- Na app, o motorista só vê valores da ficha ativa (decisão de 09/11/2026). Uma
-- ficha inativa (deixou a empresa) mostrava saldo e "dívidas" da empresa antiga.
-- A app já esconde; aqui fecha-se também na base, para as duas tabelas de valores.

DROP POLICY IF EXISTS liquido_semanal_motorista_ve_os_seus ON public.motorista_liquido_semanal;
CREATE POLICY liquido_semanal_motorista_ve_os_seus ON public.motorista_liquido_semanal
  FOR SELECT TO authenticated
  USING (
    enviado_em IS NOT NULL
    AND motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma
       WHERE ma.user_id = (SELECT auth.uid()) AND ma.status_ativo IS NOT FALSE
    )
  );

DROP POLICY IF EXISTS "Motorista ve os seus movimentos" ON public.motorista_financeiro;
CREATE POLICY "Motorista ve os seus movimentos" ON public.motorista_financeiro
  FOR SELECT TO authenticated
  USING (
    motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma
       WHERE ma.user_id = (SELECT auth.uid()) AND ma.status_ativo IS NOT FALSE
    )
    AND (
      liquido_semanal_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.motorista_liquido_semanal l
         WHERE l.id = motorista_financeiro.liquido_semanal_id
           AND l.enviado_em IS NOT NULL
      )
    )
    AND NOT public.semana_resumo_por_enviar(motorista_id, data_movimento)
  );

NOTIFY pgrst, 'reload schema';
