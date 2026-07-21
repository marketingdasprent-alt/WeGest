-- RPC: motorista atualmente associado a cada viatura (hoje), com a mesma
-- prioridade usada em resolverCondutor.ts e no via-verde-import: contrato
-- ativo (contratos_renting + contrato_condutores, por vigência) primeiro,
-- motorista_viaturas como fallback. Usada na coluna "Motorista" da lista de
-- Dispositivos OBE.
CREATE OR REPLACE FUNCTION public.get_viaturas_motorista_atual(
  p_org_id uuid DEFAULT get_current_org_id()
)
RETURNS TABLE (
  viatura_id     uuid,
  motorista_id   uuid,
  motorista_nome text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    v.id AS viatura_id,
    COALESCE(cc.motorista_id, mv.motorista_id) AS motorista_id,
    m.nome AS motorista_nome
  FROM public.viaturas v
  LEFT JOIN LATERAL (
    SELECT cc2.motorista_id
    FROM public.contratos_renting cr
    JOIN public.contrato_condutores cc2 ON cc2.contrato_id = cr.id
    WHERE cr.viatura_id = v.id
      AND cr.deleted_at IS NULL
      AND cr.periodo @> now()
      AND cc2.motorista_id IS NOT NULL
      AND cc2.vigencia @> now()
    ORDER BY cc2.is_principal DESC, cc2.created_at DESC
    LIMIT 1
  ) cc ON true
  LEFT JOIN LATERAL (
    SELECT mv2.motorista_id
    FROM public.motorista_viaturas mv2
    WHERE mv2.viatura_id = v.id
      AND mv2.data_inicio <= CURRENT_DATE
      AND (mv2.data_fim IS NULL OR mv2.data_fim >= CURRENT_DATE)
    ORDER BY mv2.data_inicio DESC
    LIMIT 1
  ) mv ON true
  LEFT JOIN public.motoristas_ativos m ON m.id = COALESCE(cc.motorista_id, mv.motorista_id)
  WHERE v.org_id = p_org_id
    AND COALESCE(cc.motorista_id, mv.motorista_id) IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.get_viaturas_motorista_atual(uuid) TO authenticated;
