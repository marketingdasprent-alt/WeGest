-- O extrato do painel do motorista estava a contar o líquido da semana como se
-- fosse receita (ou custo) dessa mesma semana.
--
-- `sincronizar_movimento_resumo()` escreve o líquido de volta em
-- motorista_financeiro com categoria 'resumos' e data_movimento = semana_fim —
-- portanto DENTRO do período que ele resume. A CTE `fin` desta função soma
-- motorista_financeiro por intervalo de datas sem excluir nada, por isso:
--
--   líquido positivo → crédito 'resumos' → entra em `extras` → incha a receita
--   líquido negativo → débito  'resumos' → entra em `outros` → incha os custos
--
-- Em produção: 757 movimentos, 291 motoristas, 4 semanas (30/08 a 20/09),
-- 267.324,71 EUR de receita inflacionada e 42.755,75 EUR de custos
-- inflacionados. O motorista abria o painel e via a semana dele somada ao
-- pagamento dessa mesma semana.
--
-- É exactamente o que o COMMENT da própria sincronizar_movimento_resumo() avisa:
-- "Quem LÊ motorista_financeiro por intervalo de datas tem de excluir esta
-- categoria — ela cai dentro da própria semana que resume, e contá-la duplica
-- o líquido." Os dois ecrãs do escritório já a excluíam (Resumos, via
-- ESCRITAS_PELO_PROPRIO_RESUMO; Relatório de Pagamento, via JA_NOUTRA_COLUNA);
-- só o painel do motorista é que não.
--
-- De caminho, os movimentos CANCELADOS deixam de contar. Um movimento anulado
-- não é dinheiro, e a lista de Contas/Resumo já o ignora (.neq('status',
-- 'cancelado')) — o painel contava-os na mesma: 68 movimentos e 10.982,15 EUR
-- desde 01/08. Ficava o motorista a ver custos que lhe tinham sido perdoados.
--
-- Segunda correcção, na mesma função: o "acerto" que o painel mostra passa a
-- vir de motorista_liquido_semanal — o valor que o motorista REALMENTE recebe,
-- o mesmo do Relatório de Pagamento e do movimento na ficha dele. Vinha do
-- fecho (motorista_resumo_semanal), que não inclui combustível nem portagens.
-- Ver a nota na CTE `acerto`, mais abaixo.
--
-- Nada mais muda: mesma assinatura, mesmas colunas, mesmo gate de permissões.

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
    WHERE f.motorista_id = j.mid AND f.data_movimento BETWEEN j.ini AND j.fim
      -- O líquido desta mesma semana, escrito de volta pelo gatilho do resumo.
      -- Contá-lo aqui é somar o pagamento da semana aos ganhos da semana.
      AND f.categoria IS DISTINCT FROM 'resumos'
      -- Movimento anulado não é dinheiro. Mesmo critério da lista de Contas/Resumo.
      AND COALESCE(f.status, 'pendente') <> 'cancelado'),
  renda_tarifa AS (
    SELECT COALESCE((
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
$function$;

COMMENT ON FUNCTION public.motorista_extrato_periodo(uuid, date, date) IS
  'Extrato do motorista num periodo, para o painel dele. Exclui a categoria ''resumos'' (o proprio liquido da semana, escrito de volta pelo gatilho do resumo) e os movimentos cancelados — conta-los duplicava o liquido e mostrava custos ja anulados. O acerto_liquido vem de motorista_liquido_semanal, o mesmo numero da lista de Contas/Resumo, do Relatorio de Pagamento e da conta corrente.';
