-- Complemento de 20261109120000: o motorista via escondido o resumo da semana
-- por enviar, mas os movimentos soltos dessa semana (aluguer, combustível...)
-- continuavam à vista e entravam no saldo dele (34 motoristas a 09/11/2026).
-- Agora tudo o que tem data numa semana com resumo por enviar fica escondido.

-- SECURITY DEFINER: o motorista não lê as linhas por enviar (RLS), por isso a
-- pergunta tem de ser feita por fora dela. Só devolve verdadeiro/falso.
CREATE OR REPLACE FUNCTION public.semana_resumo_por_enviar(p_motorista_id UUID, p_data DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.motorista_liquido_semanal l
     WHERE l.motorista_id = p_motorista_id
       AND p_data BETWEEN l.semana_inicio AND l.semana_fim
       AND l.enviado_em IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.semana_resumo_por_enviar(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.semana_resumo_por_enviar(UUID, DATE) TO authenticated;

DROP POLICY IF EXISTS "Motorista ve os seus movimentos" ON public.motorista_financeiro;
CREATE POLICY "Motorista ve os seus movimentos" ON public.motorista_financeiro
  FOR SELECT TO authenticated
  USING (
    motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma WHERE ma.user_id = (SELECT auth.uid())
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
