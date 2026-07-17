-- Histórico de portagens Via Verde por VIATURA (não por dispositivo OBE),
-- para a nova sub-tab "Histórico" dentro de Viatura > OBE.
--
-- Diferença chave face a get_obe_historico_portagens (que filtra por
-- nr_equipamento): aqui usamos via_verde_transacoes.viatura_id diretamente
-- — é o vínculo correto e estável mesmo que o dispositivo OBE seja mais
-- tarde reatribuído a outra viatura (o histórico de cada portagem já ficou
-- gravado com a viatura certa no momento da importação).
--
-- Resolve também, por cada portagem:
--   - motorista ativo NA DATA da passagem (via_verde_transacoes.motorista_id
--     já é calculado corretamente à data de importação, ver via-verde-import)
--   - contrato de renting ativo NA DATA da passagem (periodo @> data)
CREATE OR REPLACE FUNCTION public.get_viatura_historico_portagens(
  p_viatura_id uuid,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE (
  transaction_id text,
  transaction_date timestamptz,
  amount numeric,
  barreira_entrada text,
  barreira_saida text,
  operador text,
  tipo_evento text,
  motorista_id uuid,
  motorista_nome text,
  contrato_id uuid,
  contrato_codigo bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    t.transaction_id,
    t.transaction_date,
    t.amount,
    t.barreira_entrada,
    t.barreira_saida,
    t.operador,
    t.tipo_evento,
    t.motorista_id,
    m.nome AS motorista_nome,
    c.id AS contrato_id,
    c.codigo AS contrato_codigo
  FROM public.via_verde_transacoes t
  LEFT JOIN public.motoristas_ativos m ON m.id = t.motorista_id
  LEFT JOIN public.contratos_renting c
    ON c.viatura_id = t.viatura_id
    AND c.deleted_at IS NULL
    AND c.periodo @> t.transaction_date
  WHERE t.viatura_id = p_viatura_id
    AND (p_data_inicio IS NULL OR t.transaction_date >= p_data_inicio::timestamptz)
    AND (p_data_fim IS NULL OR t.transaction_date < (p_data_fim + 1)::timestamptz)
  ORDER BY t.transaction_date DESC
  LIMIT 1000
$$;
