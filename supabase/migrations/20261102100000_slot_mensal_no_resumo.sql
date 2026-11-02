-- Mensalidade de slot lançada sozinha no financeiro do motorista (por organização).
--
-- O "Valor Mensal" do Motorista SLOT (motoristas_ativos.slot_valor_semanal — o nome
-- da coluna ficou do tempo em que era semanal; o ecrã diz "Valor Mensal") era só
-- configuração: nada o lançava no financeiro, por isso o resumo semanal nunca o via.
-- A 02/11/2026 nem a Premium Ride nem a Década Ousada viam o slot nos resumos: só
-- recebia o débito quem tinha uma recorrência criada à mão.
--
-- Por organização, desligado por omissão para orgs novas decidirem; ligado nas duas
-- que usam slot. As cobranças mensais das reservas (gerar_cobrancas_slot_mensais)
-- continuam à parte: faturar uma delas e descontar no resumo é cobrar duas vezes.
--
-- O débito cai na segunda-feira da semana que contém o dia 1 do mês (a mesma
-- semana em que a recorrência mensal da Premium Ride já lançava), categoria
-- slot_mensal → coluna Slot do resumo.

ALTER TABLE public.organizacoes
  ADD COLUMN IF NOT EXISTS slot_mensal_automatico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizacoes.slot_mensal_automatico IS
  'Lança todos os meses o Valor Mensal do Motorista SLOT como débito slot_mensal no financeiro (gerar_slot_mensal_motoristas), para entrar no resumo semanal.';

UPDATE public.organizacoes
   SET slot_mensal_automatico = true
 WHERE id IN (
   '11111111-1111-1111-1111-111111111111', -- Década Ousada
   'c0918dc8-90be-4e0d-8193-5c81ede7c902'  -- PREMIUM RIDE
 );

-- Um débito automático por motorista e mês; os lançamentos manuais (referencia NULL) ficam de fora.
CREATE UNIQUE INDEX IF NOT EXISTS motorista_financeiro_slot_ref_unico
  ON public.motorista_financeiro (referencia)
  WHERE categoria = 'slot_mensal' AND referencia LIKE 'slot-auto:%';

CREATE OR REPLACE FUNCTION public.gerar_slot_mensal_motoristas(p_data date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_semana    date := date_trunc('week', p_data)::date;
  v_mes       date := date_trunc('month', v_semana + 6)::date;
  v_motorista record;
  v_criadas   integer := 0;
  v_rowcount  integer;
BEGIN
  -- Só a semana que contém um dia 1 lança; nas outras não há nada a fazer.
  IF v_mes < v_semana THEN
    RETURN 0;
  END IF;

  FOR v_motorista IN
    SELECT m.id, m.org_id, m.slot_valor_semanal AS valor
      FROM public.motoristas_ativos m
      JOIN public.organizacoes o ON o.id = m.org_id
     WHERE o.slot_mensal_automatico
       AND m.status_ativo = true
       AND m.is_slot = true
       AND m.slot_valor_semanal > 0
       -- Quem já tem recorrência de slot ativa é cobrado por ela.
       AND NOT EXISTS (
         SELECT 1 FROM public.motorista_financeiro_recorrencias r
          WHERE r.motorista_id = m.id AND r.categoria = 'slot_mensal' AND r.status = 'ativa'
       )
       -- Nem por cima de um lançamento manual de slot nessa semana.
       AND NOT EXISTS (
         SELECT 1 FROM public.motorista_financeiro f
          WHERE f.motorista_id = m.id AND f.categoria = 'slot_mensal'
            AND f.status IS DISTINCT FROM 'cancelado'
            AND f.data_movimento BETWEEN v_semana AND v_semana + 6
       )
  LOOP
    INSERT INTO public.motorista_financeiro (
      motorista_id, org_id, tipo, categoria, descricao, valor,
      data_movimento, status, referencia
    ) VALUES (
      v_motorista.id, v_motorista.org_id, 'debito', 'slot_mensal',
      -- MM/YYYY e não TMMonth: o locale da base é inglês ("November").
      'Mensalidade slot — ' || to_char(v_mes, 'MM/YYYY'),
      v_motorista.valor, v_semana, 'pendente',
      'slot-auto:' || v_motorista.id || ':' || to_char(v_mes, 'YYYY-MM')
    )
    ON CONFLICT (referencia) WHERE categoria = 'slot_mensal' AND referencia LIKE 'slot-auto:%'
    DO NOTHING;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    v_criadas := v_criadas + v_rowcount;
  END LOOP;

  RETURN v_criadas;
END;
$$;

COMMENT ON FUNCTION public.gerar_slot_mensal_motoristas(date) IS
  'Lança a mensalidade de slot (débito slot_mensal) dos motoristas slot das organizações com slot_mensal_automatico, na segunda-feira da semana que contém o dia 1. Idempotente por referência slot-auto:<motorista>:<YYYY-MM>. Devolve o nº criado.';

-- Só o service_role (o cron) executa; os default privileges dariam EXECUTE a authenticated.
REVOKE EXECUTE ON FUNCTION public.gerar_slot_mensal_motoristas(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_slot_mensal_motoristas(date) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gerar-slot-mensal-motoristas') THEN
    PERFORM cron.unschedule('gerar-slot-mensal-motoristas');
  END IF;
  PERFORM cron.schedule(
    'gerar-slot-mensal-motoristas',
    '0 6 * * 1',
    $cron$ SELECT public.gerar_slot_mensal_motoristas(); $cron$
  );
END $$;

NOTIFY pgrst, 'reload schema';
