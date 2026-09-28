-- Cobrança mensal de slots: uma reserva má deixa de travar as outras.
--
-- A 28-09-2026 07:00 o cron gerar-cobrancas-slot-mensais abortou com
-- "Cliente do motorista pertence a outra organização" (levantado por
-- fn_ensure_cliente_condutor, chamada por fn_slot_inserir_cobranca). A função
-- corre um FOR sobre as reservas slot de TODAS as organizações e chamava
-- fn_slot_inserir_cobranca sem savepoint: a primeira reserva com dados
-- cruzados (reserva #24 da Premium Ride, motorista com cliente_id noutra org)
-- abortava a transacção inteira, para todas as organizações.
--
-- Desta vez não se perdeu nada: a corrida de 01-09 criou 27 cobranças antes
-- de a verificação de org entrar em produção (25-09), e a de 28-09 (segunda-
-- feira: a schedule '0 7 1-7 * 1' também dispara às segundas) não tinha nada
-- para criar. O risco era a corrida de 1 de Outubro.
--
-- O que muda: só a resiliência do loop. A chamada a fn_slot_inserir_cobranca
-- passa a correr num sub-bloco por reserva (BEGIN ... EXCEPTION). Uma reserva
-- que falha:
--   1. sai em RAISE WARNING (id, org_id, SQLERRM, SQLSTATE);
--   2. fica registada em public.failed_jobs (source_table 'reservas',
--      job_type 'cobranca.slot_mensal', org_id da reserva). O pg_cron não
--      guarda WARNINGs e passa a marcar a corrida como sucesso, por isso é o
--      dead-letter que avisa: o trigger on_failed_job_notify notifica os
--      admins DA ORG da reserva. Uma linha por reserva enquanto não estiver
--      resolvida; se o próprio registo falhar, sai um WARNING e o loop segue;
--   3. conta para v_falhadas, e o loop passa à próxima.
-- No fim, se houve falhas, sai um WARNING com o resumo. O valor devolvido
-- continua a ser o número de cobranças criadas — o cron faz
-- `select gerar_cobrancas_slot_mensais()`.
--
-- O que NÃO muda: a lógica de negócio (stub do mês de entrada em M+1, mês
-- cheio de M+2 em diante, idempotência pelo índice parcial de
-- contrato_cobrancas), fn_ensure_cliente_condutor, fn_slot_inserir_cobranca,
-- SECURITY DEFINER, search_path e as grants (só service_role executa). A
-- correcção dos dados cruzados é à parte.

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
  v_falhadas  integer := 0;
  v_erro      text;
  v_estado    text;
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

    -- Cada reserva corre no seu próprio sub-bloco (savepoint implícito): se
    -- esta falhar, só ela fica por gerar — as outras organizações não pagam
    -- pelos dados cruzados de uma.
    BEGIN
      v_criadas := v_criadas + public.fn_slot_inserir_cobranca(v_reserva, v_de, v_ate, v_valor, v_desc);
    EXCEPTION WHEN OTHERS THEN
      v_falhadas := v_falhadas + 1;
      v_erro     := SQLERRM;
      v_estado   := SQLSTATE;
      RAISE WARNING 'gerar_cobrancas_slot_mensais: reserva % (org %) ficou por cobrar: % [%]',
        v_reserva.id, v_reserva.org_id, v_erro, v_estado;

      -- O pg_cron não guarda WARNINGs e marca a corrida como sucesso: fica em
      -- failed_jobs (dead-letter), onde on_failed_job_notify avisa os admins
      -- da org da reserva. Uma linha por reserva enquanto não for resolvida.
      -- Sub-bloco próprio: uma falha ao registar não pode derrubar o loop.
      BEGIN
        INSERT INTO public.failed_jobs (source_table, source_id, org_id, job_type, payload, attempts, last_error)
        SELECT 'reservas', v_reserva.id, v_reserva.org_id, 'cobranca.slot_mensal',
               jsonb_build_object('periodo_de', v_de, 'periodo_ate', v_ate, 'valor', v_valor, 'sqlstate', v_estado),
               1, v_erro
        WHERE NOT EXISTS (
          SELECT 1 FROM public.failed_jobs f
          WHERE f.source_id = v_reserva.id
            AND f.job_type = 'cobranca.slot_mensal'
            AND f.resolved = false
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'gerar_cobrancas_slot_mensais: não consegui registar a reserva % em failed_jobs: % [%]',
          v_reserva.id, SQLERRM, SQLSTATE;
      END;
    END;
  END LOOP;

  IF v_falhadas > 0 THEN
    RAISE WARNING 'gerar_cobrancas_slot_mensais: % reserva(s) falharam, % cobrança(s) criadas',
      v_falhadas, v_criadas;
  END IF;

  RETURN v_criadas;
END;
$$;

COMMENT ON FUNCTION public.gerar_cobrancas_slot_mensais() IS
  'Gera as cobranças mensais de slot em falta (stub do mês de entrada em M+1, mês cheio de M+2 em diante). Idempotente. Devolve o nº de cobranças criadas. Cada reserva corre no seu próprio sub-bloco: uma reserva que falha (ex.: motorista com cliente noutra organização) sai em WARNING, fica em failed_jobs (job_type cobranca.slot_mensal, org da reserva) e não trava as outras.';

-- Grants iguais à baseline (e a produção): só o service_role (o cron) executa.
REVOKE ALL ON FUNCTION public.gerar_cobrancas_slot_mensais() FROM PUBLIC;
GRANT ALL ON FUNCTION public.gerar_cobrancas_slot_mensais() TO service_role;

-- O Supabase serve a API a partir de um cache do desenho da base: sem isto,
-- a função nova só é reconhecida na próxima vez que ele recarregar.
NOTIFY pgrst, 'reload schema';
