-- ============================================================
-- Slot — cobrança de ENTRADA (trigger)
-- ============================================================
-- Quando um slot (reserva regime='slot') fica ativo, cria de imediato a
-- cobrança do 1º mês de calendário completo após a entrada (M+1), valor cheio.
-- Idempotente via índice parcial contrato_cobrancas_slot_periodo_unico.
-- ============================================================

-- Helper partilhado (entrada + cron): insere uma cobrança de slot já com a
-- repartição de IVA. Devolve 1 se inseriu, 0 se já existia.
CREATE OR REPLACE FUNCTION public.fn_slot_inserir_cobranca(
  p_reserva     public.reservas,
  p_de          date,
  p_ate         date,
  p_valor_bruto numeric,
  p_descricao   text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_taxa     numeric := 23;
  v_sem_iva  numeric;
  v_cli      uuid;
  v_nome     text;
  v_rowcount integer;
BEGIN
  IF p_reserva.condutor_id IS NULL OR p_valor_bruto IS NULL OR p_valor_bruto <= 0 THEN
    RETURN 0;
  END IF;

  v_sem_iva := round(p_valor_bruto / (1 + v_taxa / 100), 2);
  v_cli := public.fn_ensure_cliente_condutor(p_reserva.condutor_id, p_reserva.org_id);
  SELECT nome INTO v_nome FROM public.clientes WHERE id = v_cli;

  INSERT INTO public.contrato_cobrancas (
    org_id, contrato_id, reserva_id, periodo_de, periodo_ate, descricao,
    destinatario_id, destinatario_papel, destinatario_nome,
    valor_sem_iva, taxa_iva, emite_fatura_fiscal, estado, tipo_cobranca
  )
  VALUES (
    p_reserva.org_id, NULL, p_reserva.id, p_de, p_ate, p_descricao,
    v_cli, 'condutor', v_nome,
    v_sem_iva, v_taxa, true, 'pendente', 'slot_mensal'
  )
  ON CONFLICT (reserva_id, periodo_de, periodo_ate)
    WHERE tipo_cobranca = 'slot_mensal' AND estado <> 'anulada'
  DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  RETURN v_rowcount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_slot_inserir_cobranca(public.reservas, date, date, numeric, text) TO service_role;

-- Trigger de entrada
CREATE OR REPLACE FUNCTION public.fn_slot_cobranca_entrada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entrada date;
  v_de      date;
  v_ate     date;
BEGIN
  -- Só slots ativos com valor mensal definido
  IF NEW.regime IS DISTINCT FROM 'slot'
     OR NEW.estado NOT IN ('confirmada', 'em_curso')
     OR NEW.slot_valor_mensal IS NULL
     OR NEW.condutor_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_entrada := NEW.data_inicio::date;
  -- Mês de calendário completo a seguir (M+1)
  v_de  := (date_trunc('month', v_entrada)::date + interval '1 month')::date;
  v_ate := (date_trunc('month', v_entrada)::date + interval '2 month' - interval '1 day')::date;

  -- Não criar cobrança de entrada retroativa: ao definir o valor mensal num slot
  -- já existente (backfill), o mês M+1 pode estar no passado. Nesse caso a
  -- faturação corrente é tratada pelo cron mensal.
  IF v_de < date_trunc('month', current_date)::date THEN
    RETURN NEW;
  END IF;

  PERFORM public.fn_slot_inserir_cobranca(
    NEW, v_de, v_ate, NEW.slot_valor_mensal,
    'Slot — ' || to_char(v_de, 'TMMonth YYYY')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_slot_cobranca_entrada ON public.reservas;
CREATE TRIGGER trg_slot_cobranca_entrada
  AFTER INSERT OR UPDATE OF estado, regime, slot_valor_mensal, condutor_id ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.fn_slot_cobranca_entrada();
