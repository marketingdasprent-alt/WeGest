-- ============================================================
-- RPC de leitura do Histórico de Edições do Contrato
-- ============================================================
-- Devolve os marcos do ciclo de vida + a última alteração, já com o NOME do
-- ator resolvido (join a profiles). A UI consome isto diretamente.
--
-- Por cada evento_tipo de marco devolve a ocorrência MAIS RECENTE (ex.: se o
-- contrato foi reaberto e fechado de novo, mostra o último fecho). A "última
-- alteração" é o evento mais recente de QUALQUER tipo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_historico_resumo(p_contrato_id uuid)
RETURNS TABLE (
  evento_tipo text,
  ator_id     uuid,
  ator_nome   text,
  detalhe     text,
  criado_em   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT h.evento_tipo, h.ator_id, h.detalhe, h.criado_em,
           row_number() OVER (
             PARTITION BY h.evento_tipo ORDER BY h.criado_em DESC
           ) AS rn_por_tipo
    FROM public.contrato_historico h
    WHERE h.contrato_id = p_contrato_id
      AND h.org_id = public.get_current_org_id()
  ),
  -- Marcos: a ocorrência mais recente de cada um dos 4 tipos de ciclo de vida.
  marcos AS (
    SELECT evento_tipo, ator_id, detalhe, criado_em
    FROM base
    WHERE rn_por_tipo = 1
      AND evento_tipo IN ('reserva_criada','contrato_aberto','contrato_fechado','contrato_faturado')
  ),
  -- Última alteração: evento mais recente de QUALQUER tipo (inclui 'alteracao').
  ultima AS (
    SELECT 'ultima_alteracao'::text AS evento_tipo, ator_id, detalhe, criado_em
    FROM base
    ORDER BY criado_em DESC
    LIMIT 1
  ),
  todos AS (
    SELECT * FROM marcos
    UNION ALL
    SELECT * FROM ultima
  )
  SELECT t.evento_tipo, t.ator_id, COALESCE(p.nome, 'Utilizador desconhecido') AS ator_nome,
         t.detalhe, t.criado_em
  FROM todos t
  LEFT JOIN public.profiles p ON p.id = t.ator_id
  -- Ordem lógica de apresentação: reserva → aberto → fechado → faturado → última.
  ORDER BY CASE t.evento_tipo
    WHEN 'reserva_criada'    THEN 1
    WHEN 'contrato_aberto'   THEN 2
    WHEN 'contrato_fechado'  THEN 3
    WHEN 'contrato_faturado' THEN 4
    WHEN 'ultima_alteracao'  THEN 5
    ELSE 9
  END;
$$;

GRANT EXECUTE ON FUNCTION public.contrato_historico_resumo(uuid) TO authenticated;
