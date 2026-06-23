-- Add p_desde parameter to filter out old imports
-- When p_desde is NULL the function returns all unassociated cards (backwards compatible)
CREATE OR REPLACE FUNCTION public.get_cartoes_combustivel_nao_associados(p_desde date DEFAULT NULL)
RETURNS TABLE(plataforma text, card_number text, nome text, total numeric, transacoes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT 'bp'::text, bp.raw_data->>'Nº cartão', NULL::text,
         ROUND(SUM(bp.amount)::numeric, 2), COUNT(*)
  FROM public.bp_transacoes bp
  WHERE bp.motorista_id IS NULL
    AND COALESCE(bp.raw_data->>'Nº cartão','') <> ''
    AND (p_desde IS NULL OR bp.transaction_date >= p_desde)
  GROUP BY bp.raw_data->>'Nº cartão'
  UNION ALL
  SELECT 'repsol'::text, rt.card_number, NULL::text,
         ROUND(SUM(rt.amount)::numeric, 2), COUNT(*)
  FROM public.repsol_transacoes rt
  WHERE rt.motorista_id IS NULL
    AND COALESCE(rt.card_number,'') <> ''
    AND (p_desde IS NULL OR rt.transaction_date >= p_desde)
  GROUP BY rt.card_number
  UNION ALL
  SELECT 'edp'::text, et.card_number, MAX(et.raw_data->>'Nome cartão'),
         ROUND(SUM(et.amount)::numeric, 2), COUNT(*)
  FROM public.edp_transacoes et
  WHERE et.motorista_id IS NULL
    AND COALESCE(et.card_number,'') <> ''
    AND (p_desde IS NULL OR et.transaction_date >= p_desde)
  GROUP BY et.card_number
$$;

GRANT EXECUTE ON FUNCTION public.get_cartoes_combustivel_nao_associados(date) TO authenticated;
