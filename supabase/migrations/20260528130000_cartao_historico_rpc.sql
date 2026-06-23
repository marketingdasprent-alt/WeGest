-- RPC para histórico de consumo de um cartão frota por tipo e número
CREATE OR REPLACE FUNCTION public.get_cartao_historico_consumo(p_tipo text, p_numero text)
RETURNS TABLE (
  transaction_date timestamptz,
  amount           numeric,
  station_name     text,
  fuel_type        text,
  quantity         numeric,
  motorista_nome   text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.transaction_date, t.amount, t.station_name, t.fuel_type, t.quantity,
         m.nome
  FROM public.bp_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  WHERE p_tipo = 'bp' AND (t.raw_data->>'Nº cartão') = p_numero
  UNION ALL
  SELECT t.transaction_date, t.amount, t.station_name, t.fuel_type, t.quantity,
         m.nome
  FROM public.repsol_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  WHERE p_tipo = 'repsol' AND t.card_number = p_numero
  UNION ALL
  SELECT t.transaction_date, t.amount, t.station_name, NULL::text, t.quantity,
         m.nome
  FROM public.edp_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  WHERE p_tipo = 'edp' AND t.card_number = p_numero
  ORDER BY transaction_date DESC
  LIMIT 200
$$;

GRANT EXECUTE ON FUNCTION public.get_cartao_historico_consumo(text, text) TO authenticated;
