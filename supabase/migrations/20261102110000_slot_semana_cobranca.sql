-- Semana do mês em que a mensalidade de slot é lançada, por motorista.
--
-- Pedido a 02/11/2026: abaixo do Valor Mensal escolhe-se 1ª, 2ª, 3ª ou 4ª semana.
-- Todos começam na 1ª. A semana passa a ser contada como nas recorrências mensais
-- (gerar_movimentos_recorrentes): a N-ésima segunda-feira do mês. Até aqui era a
-- semana que contém o dia 1, cuja segunda pode cair no mês anterior; ainda não se
-- tinha lançado nada com essa regra, por isso a troca não deixa meses a meio.

ALTER TABLE public.motoristas_ativos
  ADD COLUMN IF NOT EXISTS slot_semana_cobranca smallint NOT NULL DEFAULT 1;

ALTER TABLE public.motoristas_ativos
  DROP CONSTRAINT IF EXISTS motoristas_ativos_slot_semana_cobranca_check;
ALTER TABLE public.motoristas_ativos
  ADD CONSTRAINT motoristas_ativos_slot_semana_cobranca_check
  CHECK (slot_semana_cobranca BETWEEN 1 AND 4);

COMMENT ON COLUMN public.motoristas_ativos.slot_semana_cobranca IS
  'Semana do mês (1ª a 4ª segunda-feira) em que gerar_slot_mensal_motoristas lança a mensalidade de slot.';

CREATE OR REPLACE FUNCTION public.gerar_slot_mensal_motoristas(p_data date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_semana    date := date_trunc('week', p_data)::date;
  v_mes       date := date_trunc('month', v_semana)::date;
  -- 1ª segunda do mês = dias 1–7, 2ª = 8–14, ...; a 5ª não existe todos os meses.
  v_n         integer := ceil(extract(day FROM v_semana) / 7.0)::integer;
  v_motorista record;
  v_criadas   integer := 0;
  v_rowcount  integer;
BEGIN
  FOR v_motorista IN
    SELECT m.id, m.org_id, m.slot_valor_semanal AS valor
      FROM public.motoristas_ativos m
      JOIN public.organizacoes o ON o.id = m.org_id
     WHERE o.slot_mensal_automatico
       AND m.status_ativo = true
       AND m.is_slot = true
       AND m.slot_valor_semanal > 0
       AND m.slot_semana_cobranca = v_n
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
    -- A referência é por mês: mudar a semana a meio do mês não cobra outra vez.
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
  'Lança a mensalidade de slot (débito slot_mensal) dos motoristas slot das organizações com slot_mensal_automatico, na N-ésima segunda-feira do mês escolhida em slot_semana_cobranca. Idempotente por referência slot-auto:<motorista>:<YYYY-MM>. Devolve o nº criado.';

REVOKE EXECUTE ON FUNCTION public.gerar_slot_mensal_motoristas(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_slot_mensal_motoristas(date) TO service_role;

NOTIFY pgrst, 'reload schema';
