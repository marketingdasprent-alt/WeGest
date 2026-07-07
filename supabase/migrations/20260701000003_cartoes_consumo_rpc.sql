-- ============================================================
-- RPC: consumo agregado por cartão frota (para a barra Consumo vs Plafond)
-- ============================================================
-- Devolve, para a org ativa do caller, o total gasto/litros por cartão num
-- intervalo. Linkagem: BP por raw_data->>'Nº cartão'; Repsol/EDP por card_number.
-- SECURITY DEFINER → filtra explicitamente por org (get_current_org_id()).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_cartoes_consumo(p_desde timestamptz, p_ate timestamptz)
RETURNS TABLE (tipo text, numero text, total numeric, litros numeric, n integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'bp'::text, (t.raw_data->>'Nº cartão')::text, sum(t.amount), sum(t.quantity), count(*)::int
  FROM public.bp_transacoes t
  WHERE t.org_id = public.get_current_org_id()
    AND t.transaction_date >= p_desde AND t.transaction_date < p_ate
    AND nullif(t.raw_data->>'Nº cartão', '') IS NOT NULL
  GROUP BY 2
  UNION ALL
  SELECT 'repsol'::text, t.card_number, sum(t.amount), sum(t.quantity), count(*)::int
  FROM public.repsol_transacoes t
  WHERE t.org_id = public.get_current_org_id()
    AND t.transaction_date >= p_desde AND t.transaction_date < p_ate
    AND t.card_number IS NOT NULL
  GROUP BY 2
  UNION ALL
  SELECT 'edp'::text, t.card_number, sum(t.amount), sum(t.quantity), count(*)::int
  FROM public.edp_transacoes t
  WHERE t.org_id = public.get_current_org_id()
    AND t.transaction_date >= p_desde AND t.transaction_date < p_ate
    AND t.card_number IS NOT NULL
  GROUP BY 2
$$;

GRANT EXECUTE ON FUNCTION public.get_cartoes_consumo(timestamptz, timestamptz) TO authenticated;
