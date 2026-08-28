-- ============================================================
-- Slot — geração MENSAL das cobranças (cron)
-- ============================================================
-- Corre na 1ª semana do mês. Para cada slot ativo:
--   • mês de execução R = M+1  → stub (parcela do mês de entrada M)
--   • R >= M+2                 → mês R inteiro, valor cheio
--   • R <= M                   → nada (entrada tratada pelo trigger)
-- Idempotente (ON CONFLICT via fn_slot_inserir_cobranca). EXECUTE só service_role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.gerar_cobrancas_slot_mensais()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserva   public.reservas;
  v_entrada   date;
  v_ref_mes   date := date_trunc('month', current_date)::date;
  v_meses     integer;
  v_de        date;
  v_ate       date;
  v_dias      integer;
  v_dias_mes  integer;
  v_valor     numeric;
  v_desc      text;
  v_criadas   integer := 0;
BEGIN
  FOR v_reserva IN
    SELECT r.* FROM public.reservas r
    WHERE r.regime = 'slot'
      AND r.estado IN ('confirmada', 'em_curso')
      AND r.slot_valor_mensal IS NOT NULL
      AND r.condutor_id IS NOT NULL
      AND (r.data_fim IS NULL OR r.data_fim::date >= v_ref_mes)
  LOOP
    v_entrada := v_reserva.data_inicio::date;

    -- diferença em meses de calendário entre R e o mês de entrada M
    v_meses := (extract(year FROM v_ref_mes) - extract(year FROM date_trunc('month', v_entrada))) * 12
             + (extract(month FROM v_ref_mes) - extract(month FROM date_trunc('month', v_entrada)));

    IF v_meses = 1 THEN
      -- stub: dia de entrada .. fim do mês M (inclui entrada)
      v_de       := v_entrada;
      v_ate      := (date_trunc('month', v_entrada)::date + interval '1 month' - interval '1 day')::date;
      v_dias     := (v_ate - v_de) + 1;
      v_dias_mes := extract(day FROM (date_trunc('month', v_entrada)::date + interval '1 month' - interval '1 day'))::integer;
      v_valor    := round(v_reserva.slot_valor_mensal * v_dias / v_dias_mes, 2);
      v_desc     := 'Slot — parcial ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY');
    ELSIF v_meses >= 2 THEN
      -- mês R inteiro, valor cheio
      v_de    := v_ref_mes;
      v_ate   := (v_ref_mes + interval '1 month' - interval '1 day')::date;
      v_valor := v_reserva.slot_valor_mensal;
      v_desc  := 'Slot — ' || to_char(v_ref_mes, 'TMMonth YYYY');
    ELSE
      CONTINUE;  -- R <= M: nada a gerar
    END IF;

    v_criadas := v_criadas + public.fn_slot_inserir_cobranca(v_reserva, v_de, v_ate, v_valor, v_desc);
  END LOOP;

  RETURN v_criadas;
END;
$$;

COMMENT ON FUNCTION public.gerar_cobrancas_slot_mensais() IS
  'Gera as cobranças mensais de slot em falta (stub do mês de entrada em M+1, '
  'mês cheio de M+2 em diante). Idempotente. Devolve o nº de cobranças criadas.';

GRANT EXECUTE ON FUNCTION public.gerar_cobrancas_slot_mensais() TO service_role;

-- Agendamento: 1ª segunda-feira do mês às 07:00 UTC (dia 1-7 + 2ª-feira).
DO $$
BEGIN
  PERFORM cron.unschedule('gerar-cobrancas-slot-mensais');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'gerar-cobrancas-slot-mensais',
  '0 7 1-7 * 1',
  $$ SELECT public.gerar_cobrancas_slot_mensais(); $$
);
