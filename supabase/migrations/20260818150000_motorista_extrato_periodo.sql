-- Extrato ao vivo do motorista, para o painel dele (/motorista/painel).
--
-- Distinto da tabela `motorista_resumo_semanal`, que e o fecho de semana e
-- alimenta os acertos enviados ao motorista. Sao duas contas de proposito:
-- medido a 2026-08-18, o fecho tem fronteiras de semana inconsistentes (a de
-- 2026-08-02 comeca a domingo, a Bolt usa segunda), falta-lhe a semana de
-- 2026-07-27, e a de 2026-08-10 foi fechada ANTES de a receita ser importada --
-- 29.098 EUR de aluguer contra 40 EUR de receita. Mostrar isso ao motorista
-- seria dizer-lhe que ganhou zero e deve a renda.
--
-- Enquanto o fecho nao for corrigido, esta funcao devolve TAMBEM o valor do
-- acerto (acerto_liquido) para o painel poder explicar a diferenca em vez de a
-- esconder -- decisao do utilizador a 2026-08-18.
--
-- SECURITY DEFINER e obrigatorio: as fontes estao fechadas por RLS a
-- can_view_financeiro(). A autorizacao e feita dentro da funcao, e o
-- motorista_id do pedido e o ALVO, nunca a autorizacao.

DROP FUNCTION IF EXISTS public.motorista_extrato_periodo(uuid, date, date);

CREATE FUNCTION public.motorista_extrato_periodo(
  p_motorista_id uuid, p_inicio date, p_fim date
)
RETURNS TABLE (
  periodo_inicio date, periodo_fim date,
  receita_bolt numeric, receita_uber numeric, gorjetas numeric, extras numeric,
  receita numeric, viagens_bolt integer,
  combustivel numeric, portagens numeric, aluguer numeric,
  reparacoes numeric, outros numeric, total_custos numeric, liquido numeric,
  tem_dados_receita boolean, tem_custos_lancados boolean,
  acerto_liquido numeric, tem_acerto boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM motoristas_ativos ma
             WHERE ma.id = p_motorista_id AND ma.user_id = auth.uid())
    OR (can_view_financeiro()
        AND EXISTS (SELECT 1 FROM motoristas m
                     WHERE m.id = p_motorista_id AND m.org_id = get_current_org_id()))
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'sem permissao para ver o extrato deste motorista'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH j AS (SELECT p_motorista_id AS mid, p_inicio AS ini, p_fim AS fim),
  rv AS (SELECT COALESCE(ma.recibo_verde, true) AS passa FROM motoristas_ativos ma, j WHERE ma.id = j.mid),
  bolt AS (
    SELECT COALESCE(SUM(b.ganhos_liquidos),0)::numeric AS v,
           COALESCE(SUM(b.gorjetas),0)::numeric AS g,
           COALESCE(SUM(b.viagens_terminadas),0)::int AS n
    FROM bolt_resumos_semanais b, j
    WHERE b.motorista_id = j.mid AND b.periodo_inicio <= j.fim
      AND COALESCE(b.periodo_fim, b.periodo_inicio) >= j.ini),
  uber AS (
    SELECT COALESCE(SUM(u.gross_amount),0)::numeric AS v, COUNT(*)::int AS linhas
    FROM uber_transactions u, j
    WHERE u.motorista_id = j.mid AND u.occurred_at >= j.ini::timestamptz
      AND u.occurred_at < (j.fim + 1)::timestamptz),
  port AS (
    SELECT COALESCE(SUM(t.amount),0)::numeric AS v FROM via_verde_transacoes t, j
    WHERE t.motorista_id = j.mid AND t.transaction_date >= j.ini::timestamptz
      AND t.transaction_date < (j.fim + 1)::timestamptz),
  comb AS (
    SELECT COALESCE(SUM(x.v),0)::numeric AS v FROM (
      SELECT amount AS v FROM bp_transacoes, j WHERE motorista_id = j.mid
        AND transaction_date >= j.ini::timestamptz AND transaction_date < (j.fim+1)::timestamptz
      UNION ALL SELECT amount FROM repsol_transacoes, j WHERE motorista_id = j.mid
        AND transaction_date >= j.ini::timestamptz AND transaction_date < (j.fim+1)::timestamptz
      UNION ALL SELECT amount FROM edp_transacoes, j WHERE motorista_id = j.mid
        AND transaction_date >= j.ini::timestamptz AND transaction_date < (j.fim+1)::timestamptz) x),
  fin AS (
    SELECT
      COALESCE(SUM(f.valor) FILTER (WHERE f.tipo='debito' AND f.categoria='renda_viatura'),0)::numeric AS renda_lancada,
      COALESCE(SUM(f.valor) FILTER (WHERE f.tipo='debito' AND f.categoria='reparacao'),0)::numeric AS reparacoes,
      COALESCE(SUM(f.valor) FILTER (WHERE f.tipo='debito' AND f.categoria NOT IN ('renda_viatura','reparacao')),0)::numeric AS outros,
      COALESCE(SUM(f.valor) FILTER (WHERE f.tipo='credito'),0)::numeric AS extras,
      COUNT(*)::int AS n_movimentos
    FROM motorista_financeiro f, j
    WHERE f.motorista_id = j.mid AND f.data_movimento BETWEEN j.ini AND j.fim),
  -- O lancamento explicito manda; na falta dele deriva-se do preco semanal do
  -- modelo da viatura activa. NAO se somam: seria a mesma renda duas vezes.
  -- Medido: pelo razao havia renda para 12 motoristas; pela tarifa ha para 118.
  renda_tarifa AS (
    SELECT COALESCE((
      SELECT MAX(p.preco_semana) FROM motorista_viaturas mv
      JOIN viaturas v ON v.id = mv.viatura_id
      JOIN renting_tarifa_precos_modelo p ON p.modelo_id = v.modelo_id
      WHERE mv.motorista_id = (SELECT mid FROM j) AND mv.status = 'ativo'
        AND p.preco_semana IS NOT NULL),0)::numeric AS v),
  -- Fecho de semana que se sobreponha ao periodo pedido, se existir.
  acerto AS (
    SELECT SUM(COALESCE(r.receita_bolt,0) + COALESCE(r.receita_uber,0) + COALESCE(r.receita_outras,0)
             - COALESCE(r.custo_aluguer,0) - COALESCE(r.despesa_caucao,0)
             - COALESCE(r.despesa_seguros,0) - COALESCE(r.despesa_outros,0))::numeric AS v,
           COUNT(*)::int AS n
    FROM motorista_resumo_semanal r, j
    WHERE r.motorista_id = j.mid AND r.semana_inicio <= j.fim AND r.semana_fim >= j.ini),
  base AS (
    SELECT CASE WHEN fin.renda_lancada > 0 THEN fin.renda_lancada ELSE renda_tarifa.v END AS aluguer,
           CASE WHEN rv.passa THEN bolt.v + uber.v + fin.extras
                ELSE (bolt.v - bolt.g)/1.06 + bolt.g + uber.v/1.06 + fin.extras END AS receita
    FROM rv, bolt, uber, fin, renda_tarifa)
  SELECT j.ini, j.fim,
    ROUND(bolt.v,2), ROUND(uber.v,2), ROUND(bolt.g,2), ROUND(fin.extras,2),
    ROUND(base.receita,2), bolt.n,
    ROUND(comb.v,2), ROUND(port.v,2), ROUND(base.aluguer,2),
    ROUND(fin.reparacoes,2), ROUND(fin.outros,2),
    ROUND(comb.v + port.v + base.aluguer + fin.reparacoes + fin.outros, 2),
    ROUND(base.receita - (comb.v + port.v + base.aluguer + fin.reparacoes + fin.outros), 2),
    (bolt.n > 0 OR uber.linhas > 0),
    (comb.v > 0 OR port.v > 0 OR base.aluguer > 0 OR fin.n_movimentos > 0),
    ROUND(acerto.v,2), (acerto.n > 0)
  FROM j, rv, bolt, uber, port, comb, fin, renda_tarifa, acerto, base;
END;
$$;
