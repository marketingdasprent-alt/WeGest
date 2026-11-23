-- Só leitura. Contratos TVDE vivos: valor_total_manual vs o que o fecho semanal cobra.
-- Ordem do fecho (fechar-semana-financeiro): acordado -> tarifa.preco_semana (0 conta como vazio) -> preço do modelo.

WITH vivos AS (
  SELECT c.*
  FROM public.contratos_renting c
  WHERE c.regime = 'tvde'
    AND c.deleted_at IS NULL
    AND c.substituido_em IS NULL
    AND c.estado_operacional IN ('em_curso', 'agendado')
),
principal AS (
  SELECT DISTINCT ON (cc.contrato_id) cc.contrato_id, m.nome
  FROM public.contrato_condutores cc
  JOIN public.motoristas_ativos m ON m.id = cc.motorista_id
  WHERE cc.is_principal
  ORDER BY cc.contrato_id, cc.created_at DESC
),
pendente AS (
  SELECT DISTINCT ON (p.contrato_id) p.contrato_id, p.valor_pedido
  FROM public.pedidos_alteracao_contrato p
  WHERE p.tipo = 'preco_semana' AND p.estado = 'pendente'
  ORDER BY p.contrato_id, p.created_at DESC
),
fechadas AS (
  SELECT r.contrato_id, count(*) AS semanas_fechadas, sum(r.custo_aluguer) AS soma_custo_aluguer
  FROM public.motorista_resumo_semanal r
  GROUP BY r.contrato_id
),
base AS (
  SELECT
    v.id,
    v.codigo,
    v.org_id,
    pr.nome AS motorista_principal,
    cl.nome AS cliente,
    v.matricula,
    v.tarifa_nome AS tarifa,
    v.valor_total_manual,
    v.preco_semana_acordado,
    t.preco_semana AS tarifa_preco_semana,
    pm.preco_semana AS modelo_preco_semana,
    CASE
      WHEN v.preco_semana_acordado IS NOT NULL THEN v.preco_semana_acordado
      WHEN COALESCE(t.preco_semana, 0) <> 0 THEN t.preco_semana
      ELSE COALESCE(pm.preco_semana, t.preco_semana)
    END AS resolvido_fecho,
    pe.valor_pedido AS pedido_pendente,
    f.semanas_fechadas,
    f.soma_custo_aluguer
  FROM vivos v
  LEFT JOIN principal pr ON pr.contrato_id = v.id
  LEFT JOIN public.clientes cl ON cl.id = v.cliente_id
  LEFT JOIN public.viaturas vi ON vi.id = v.viatura_id
  LEFT JOIN public.renting_tarifas t ON t.id = v.tarifa_id
  LEFT JOIN public.renting_tarifa_precos_modelo pm
         ON pm.tarifa_id = v.tarifa_id AND pm.modelo_id = vi.modelo_id
  LEFT JOIN pendente pe ON pe.contrato_id = v.id
  LEFT JOIN fechadas f ON f.contrato_id = v.id
)
SELECT
  codigo,
  org_id,
  motorista_principal,
  cliente,
  matricula,
  tarifa,
  valor_total_manual,
  preco_semana_acordado,
  tarifa_preco_semana,
  modelo_preco_semana,
  resolvido_fecho,
  valor_total_manual - resolvido_fecho AS diferenca,
  pedido_pendente,
  COALESCE(semanas_fechadas, 0) AS semanas_fechadas,
  COALESCE(soma_custo_aluguer, 0) AS soma_custo_aluguer,
  CASE
    WHEN resolvido_fecho IS NULL THEN 'sem_tarifa_ou_modelo'
    WHEN preco_semana_acordado IS NOT NULL AND valor_total_manual = preco_semana_acordado
      THEN 'espelho_do_acordado'
    WHEN valor_total_manual IS NULL OR valor_total_manual = resolvido_fecho
      THEN 'igual_a_tarifa'
    WHEN resolvido_fecho > 0 AND valor_total_manual >= 3 * resolvido_fecho
      THEN 'provavel_renda_periodo'
    ELSE 'semanal_divergente_sem_pedido'
  END AS classificacao
FROM base
ORDER BY classificacao, org_id, codigo;

-- Tarifas TVDE com preço geral que difere dos preços por modelo (a precedência
-- entre os dois está por decidir; o fecho usa o geral).
SELECT
  t.org_id,
  t.id AS tarifa_id,
  t.nome AS tarifa,
  t.preco_semana AS preco_geral,
  pm.modelo_id,
  pm.preco_semana AS preco_modelo,
  pm.preco_semana - t.preco_semana AS diferenca
FROM public.renting_tarifas t
JOIN public.renting_tarifa_precos_modelo pm ON pm.tarifa_id = t.id
WHERE t.preco_semana IS NOT NULL
  AND pm.preco_semana IS DISTINCT FROM t.preco_semana
  AND EXISTS (
    SELECT 1 FROM public.contratos_renting c
    WHERE c.tarifa_id = t.id AND c.regime = 'tvde' AND c.deleted_at IS NULL
  )
ORDER BY t.org_id, t.nome, pm.modelo_id;
