-- ============================================================
-- Cartões de combustível não associados — RPCs de listagem e associação
-- ============================================================
-- get_cartoes_combustivel_nao_associados: lista cartões (BP/Repsol/EDP) com
--   transações sem motorista_id. BP guarda o nº em raw_data->>'Nº cartão',
--   Repsol/EDP na coluna card_number (EDP backfilled de raw_data->>'Cartão').
-- associar_cartao_combustivel: grava o cartão na ficha (cartao_bp/repsol/edp)
--   e propaga motorista_id às transações desse cartão.
-- ============================================================

-- Garantir card_number preenchido no EDP (estava só em raw_data)
UPDATE public.edp_transacoes
SET card_number = raw_data->>'Cartão'
WHERE card_number IS NULL AND raw_data->>'Cartão' IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_cartoes_combustivel_nao_associados()
RETURNS TABLE(plataforma text, card_number text, nome text, total numeric, transacoes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT 'bp'::text, bp.raw_data->>'Nº cartão', NULL::text,
         ROUND(SUM(bp.amount)::numeric, 2), COUNT(*)
  FROM public.bp_transacoes bp
  WHERE bp.motorista_id IS NULL AND COALESCE(bp.raw_data->>'Nº cartão','') <> ''
  GROUP BY bp.raw_data->>'Nº cartão'
  UNION ALL
  SELECT 'repsol'::text, rt.card_number, NULL::text,
         ROUND(SUM(rt.amount)::numeric, 2), COUNT(*)
  FROM public.repsol_transacoes rt
  WHERE rt.motorista_id IS NULL AND COALESCE(rt.card_number,'') <> ''
  GROUP BY rt.card_number
  UNION ALL
  SELECT 'edp'::text, et.card_number, MAX(et.raw_data->>'Nome cartão'),
         ROUND(SUM(et.amount)::numeric, 2), COUNT(*)
  FROM public.edp_transacoes et
  WHERE et.motorista_id IS NULL AND COALESCE(et.card_number,'') <> ''
  GROUP BY et.card_number
$$;
GRANT EXECUTE ON FUNCTION public.get_cartoes_combustivel_nao_associados() TO authenticated;

CREATE OR REPLACE FUNCTION public.associar_cartao_combustivel(
  p_plataforma text, p_card text, p_motorista uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE afetadas integer := 0;
BEGIN
  IF p_plataforma = 'bp' THEN
    UPDATE motoristas_ativos
    SET cartao_bp = CASE WHEN COALESCE(cartao_bp,'')='' THEN p_card ELSE cartao_bp || ' / ' || p_card END
    WHERE id = p_motorista;
    UPDATE bp_transacoes SET motorista_id = p_motorista
    WHERE motorista_id IS NULL AND raw_data->>'Nº cartão' = p_card;
    GET DIAGNOSTICS afetadas = ROW_COUNT;
  ELSIF p_plataforma = 'repsol' THEN
    UPDATE motoristas_ativos
    SET cartao_repsol = CASE WHEN COALESCE(cartao_repsol,'')='' THEN p_card ELSE cartao_repsol || ' / ' || p_card END
    WHERE id = p_motorista;
    UPDATE repsol_transacoes SET motorista_id = p_motorista
    WHERE motorista_id IS NULL AND card_number = p_card;
    GET DIAGNOSTICS afetadas = ROW_COUNT;
  ELSIF p_plataforma = 'edp' THEN
    UPDATE motoristas_ativos
    SET cartao_edp = CASE WHEN COALESCE(cartao_edp,'')='' THEN p_card ELSE cartao_edp || ' / ' || p_card END
    WHERE id = p_motorista;
    UPDATE edp_transacoes SET motorista_id = p_motorista
    WHERE motorista_id IS NULL AND card_number = p_card;
    GET DIAGNOSTICS afetadas = ROW_COUNT;
  END IF;
  RETURN afetadas;
END;
$$;
GRANT EXECUTE ON FUNCTION public.associar_cartao_combustivel(text, text, uuid) TO authenticated;
