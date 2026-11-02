-- Seguro semanal automático volta a correr.
--
-- A ficha do motorista diz que o "Seguro semanal (€)" é debitado sozinho todas as
-- semanas, mas a 02/11/2026 não havia nenhum job pg_cron a chamar
-- gerar_seguros_semanais (o agendamento ficou na migração arquivada
-- 20260707150000_seguro_recorrente_semanal.sql e não passou para a baseline) e
-- havia 0 movimentos 'seguro-auto:'. Quem tinha seguro foi cobrado por
-- recorrência ou à mão.
--
-- Para não cobrar duas vezes ao ligar o cron, a função passa a saltar quem já
-- tem recorrência de seguro ativa ou um seguro lançado (não cancelado) nessa semana.

CREATE OR REPLACE FUNCTION public.gerar_seguros_semanais(p_semanas_a_frente integer DEFAULT 0)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_motorista record;
  v_inicio date;
  v_fim date;
  v_ref text;
  v_criadas integer := 0;
  v_rowcount integer;
BEGIN
  IF p_semanas_a_frente IS NULL OR p_semanas_a_frente NOT BETWEEN 0 AND 4 THEN
    RAISE EXCEPTION 'A antecipação deve estar entre 0 e 4 semanas' USING ERRCODE = '22023';
  END IF;
  v_inicio := (date_trunc('week', current_date) + (p_semanas_a_frente || ' weeks')::interval)::date;
  v_fim := v_inicio + 6;
  FOR v_motorista IN
    SELECT m.id, m.org_id, m.seguro_valor_semanal FROM public.motoristas_ativos m
    WHERE m.status_ativo = true AND m.seguro_valor_semanal IS NOT NULL AND m.seguro_valor_semanal > 0
      -- Quem já tem recorrência de seguro ativa é cobrado por ela.
      AND NOT EXISTS (
        SELECT 1 FROM public.motorista_financeiro_recorrencias r
         WHERE r.motorista_id = m.id AND r.categoria = 'seguros' AND r.status = 'ativa'
      )
      -- Nem por cima de um seguro já lançado (à mão ou por outra via) nessa semana.
      AND NOT EXISTS (
        SELECT 1 FROM public.motorista_financeiro f
         WHERE f.motorista_id = m.id AND f.categoria = 'seguros'
           AND f.status IS DISTINCT FROM 'cancelado'
           AND f.data_movimento BETWEEN v_inicio AND v_fim
           AND f.referencia IS DISTINCT FROM 'seguro-auto:' || m.id || ':' || to_char(v_inicio, 'YYYY-MM-DD')
      )
  LOOP
    v_ref := 'seguro-auto:' || v_motorista.id || ':' || to_char(v_inicio, 'YYYY-MM-DD');
    INSERT INTO public.motorista_financeiro (
      motorista_id, org_id, tipo, categoria, descricao, valor,
      data_movimento, status, referencia
    ) VALUES (
      v_motorista.id, v_motorista.org_id, 'debito', 'seguros',
      'Seguro semanal (' || to_char(v_inicio, 'DD/MM') || ' a ' || to_char(v_fim, 'DD/MM/YYYY') || ')',
      v_motorista.seguro_valor_semanal, v_inicio, 'pendente', v_ref
    )
    ON CONFLICT (referencia) WHERE categoria = 'seguros' AND referencia LIKE 'seguro-auto:%' DO NOTHING;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    v_criadas := v_criadas + v_rowcount;
  END LOOP;
  RETURN v_criadas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gerar_seguros_semanais(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_seguros_semanais(integer) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gerar-seguros-semanais') THEN
    PERFORM cron.unschedule('gerar-seguros-semanais');
  END IF;
  PERFORM cron.schedule(
    'gerar-seguros-semanais',
    '0 6 * * 1',
    $cron$ SELECT public.gerar_seguros_semanais(0); $cron$
  );
END $$;

NOTIFY pgrst, 'reload schema';
