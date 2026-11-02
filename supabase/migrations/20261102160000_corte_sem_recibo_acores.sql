-- Corte de quem não passa recibo verde (ou tem Retenção) por motorista: 6% no
-- continente, 4% nos Açores. Pedido a 02/11/2026. Mesma mecânica (ganhos das
-- plataformas ÷ 1,06 ou ÷ 1,04, gorjeta da Bolt de fora); muda só a taxa.

ALTER TABLE public.motoristas_ativos
  ADD COLUMN IF NOT EXISTS corte_sem_recibo_pct numeric(5,2) NOT NULL DEFAULT 6
    CONSTRAINT motoristas_ativos_corte_sem_recibo_pct_check CHECK (corte_sem_recibo_pct BETWEEN 0 AND 100);

COMMENT ON COLUMN public.motoristas_ativos.corte_sem_recibo_pct IS
  'Corte (%) aos ganhos das plataformas de quem não passa recibo verde ou tem Retenção: 6 no continente, 4 nos Açores. A receita divide por 1 + taxa.';

-- Os motoristas dos Açores sem recibo foram marcados a 4% em produção a 02/11/2026
-- (dados, não estrutura: ficam fora da migração).

-- Extrato do portal: redefinição integral da 20261023120000; muda só o divisor.
CREATE OR REPLACE FUNCTION public.motorista_extrato_periodo(p_motorista_id uuid, p_inicio date, p_fim date)
 RETURNS TABLE(periodo_inicio date, periodo_fim date, receita_bolt numeric, receita_uber numeric, gorjetas numeric, extras numeric, receita numeric, viagens_bolt integer, combustivel numeric, portagens numeric, aluguer numeric, reparacoes numeric, outros numeric, total_custos numeric, liquido numeric, tem_dados_receita boolean, tem_custos_lancados boolean, acerto_liquido numeric, tem_acerto boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Recebe o valor integral só quem passa recibo verde e não tem Retenção.
  rv AS (SELECT COALESCE(ma.recibo_verde, true) AND NOT COALESCE(ma.retencao_irs, false) AS passa,
                COALESCE(ma.retencao_irs, false) AS retencao,
                COALESCE(ma.retencao_iva_pct, 23) / 100 AS iva,
                COALESCE(ma.retencao_irs_pct, 23) / 100 AS irs,
                -- 1,06 no continente, 1,04 nos Açores (corte_sem_recibo_pct da ficha).
                1 + COALESCE(ma.corte_sem_recibo_pct, 6) / 100 AS div
           FROM motoristas_ativos ma, j WHERE ma.id = j.mid),
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
    WHERE f.motorista_id = j.mid AND f.data_movimento BETWEEN j.ini AND j.fim
      -- O líquido desta mesma semana, escrito de volta pelo gatilho do resumo.
      -- Contá-lo aqui é somar o pagamento da semana aos ganhos da semana.
      AND f.categoria IS DISTINCT FROM 'resumos'
      -- Movimento anulado não é dinheiro. Mesmo critério da lista de Contas/Resumo.
      AND COALESCE(f.status, 'pendente') <> 'cancelado'),
  -- Preço negociado do contrato TVDE em curso ganha à estimativa pela tabela.
  renda_tarifa AS (
    SELECT COALESCE((
      SELECT c.preco_semana_acordado FROM contratos_renting c
      JOIN contrato_condutores cc ON cc.contrato_id = c.id
      WHERE cc.motorista_id = (SELECT mid FROM j) AND c.regime = 'tvde'
        AND c.deleted_at IS NULL AND c.substituido_em IS NULL
        AND c.estado_operacional = 'em_curso' AND c.preco_semana_acordado IS NOT NULL
      ORDER BY c.data_inicio DESC LIMIT 1), (
      SELECT MAX(p.preco_semana) FROM motorista_viaturas mv
      JOIN viaturas v ON v.id = mv.viatura_id
      JOIN renting_tarifa_precos_modelo p ON p.modelo_id = v.modelo_id
      WHERE mv.motorista_id = (SELECT mid FROM j) AND mv.status = 'ativo'
        AND p.preco_semana IS NOT NULL),0)::numeric AS v),
  -- O acerto da semana: o valor que o motorista REALMENTE recebe.
  --
  -- Lia-se motorista_resumo_semanal, a conta do fecho — que não inclui
  -- combustível nem portagens e por isso não é o que se paga. O painel dizia
  -- "é esse o valor que conta para pagamento" e não era: na semana 07–13/09
  -- divergia em 107 dos 154 motoristas, até 1.282,39 EUR num deles.
  --
  -- motorista_liquido_semanal é a mesma cadeia, do princípio ao fim:
  --   lista de Contas/Resumo  =  "Valor a Pagar" do Relatório de Pagamento
  --   =  motorista_liquido_semanal  =  movimento 'resumos' na ficha do motorista
  -- Agora o painel entra nessa cadeia em vez de ter um número só dele.
  acerto AS (
    SELECT SUM(l.liquido)::numeric AS v,
           COUNT(*)::int AS n
    FROM motorista_liquido_semanal l, j
    WHERE l.motorista_id = j.mid AND l.semana_inicio <= j.fim AND l.semana_fim >= j.ini),
  base AS (
    SELECT CASE WHEN fin.renda_lancada > 0 THEN fin.renda_lancada ELSE renda_tarifa.v END AS aluguer,
           CASE WHEN rv.passa THEN bolt.v + uber.v + fin.extras
                ELSE (bolt.v - bolt.g)/rv.div + bolt.g + uber.v/rv.div + fin.extras END AS receita
    FROM rv, bolt, uber, fin, renda_tarifa),
  liq AS (
    SELECT ROUND(base.receita - (comb.v + port.v + base.aluguer + fin.reparacoes + fin.outros), 2) AS l
    FROM base, comb, port, fin)
  SELECT j.ini, j.fim,
    ROUND(bolt.v,2), ROUND(uber.v,2), ROUND(bolt.g,2), ROUND(fin.extras,2),
    ROUND(base.receita,2), bolt.n,
    ROUND(comb.v,2), ROUND(port.v,2), ROUND(base.aluguer,2),
    ROUND(fin.reparacoes,2), ROUND(fin.outros,2),
    ROUND(comb.v + port.v + base.aluguer + fin.reparacoes + fin.outros, 2),
    -- Retenção: + IVA − IRS, cada linha ao cêntimo (calcularRetencao em src/).
    CASE WHEN rv.retencao
         THEN ROUND(liq.l + ROUND(liq.l * rv.iva, 2) - ROUND(liq.l * rv.irs, 2), 2)
         ELSE liq.l END,
    (bolt.n > 0 OR uber.linhas > 0),
    (comb.v > 0 OR port.v > 0 OR base.aluguer > 0 OR fin.n_movimentos > 0),
    ROUND(acerto.v,2), (acerto.n > 0)
  FROM j, rv, bolt, uber, port, comb, fin, renda_tarifa, acerto, base, liq;
END;
$function$;

NOTIFY pgrst, 'reload schema';
