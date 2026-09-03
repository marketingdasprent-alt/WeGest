-- Agrega receita (Bolt, Uber) e custo (BP, Repsol, EDP, Via Verde) de uma
-- org num periodo, para o card "Resumos por Plataforma" do dashboard
-- Financeiro. So can_view_financeiro() pode chamar — mesma guarda usada
-- em can_view_financeiro() e motorista_extrato_periodo.

CREATE OR REPLACE FUNCTION "public"."dashboard_resumo_plataformas"(
  "p_org_id" uuid,
  "p_periodo_inicio" date,
  "p_periodo_fim" date
) RETURNS TABLE("plataforma" text, "tipo_valor" text, "valor" numeric, "valor_bruto" numeric, "comissao" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_org_id IS DISTINCT FROM public.get_current_org_id() THEN
    RAISE EXCEPTION 'org invalida' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.can_view_financeiro() THEN
    RAISE EXCEPTION 'sem permissao para ver o resumo financeiro' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT 'Bolt'::text, 'receita'::text,
         COALESCE(SUM(b.ganhos_liquidos), 0)::numeric,
         COALESCE(SUM(b.ganhos_brutos_total), 0)::numeric,
         COALESCE(SUM(b.comissoes), 0)::numeric
    FROM public.bolt_resumos_semanais b
   WHERE b.org_id = p_org_id
     AND b.periodo_inicio >= p_periodo_inicio
     AND b.periodo_fim <= p_periodo_fim

  UNION ALL
  SELECT 'Uber', 'receita',
         COALESCE(SUM(u.ganhos_liquidos), 0),
         COALESCE(SUM(u.ganhos_brutos), 0),
         COALESCE(SUM(u.comissoes), 0)
    FROM public.uber_resumos_semanais u
   WHERE u.org_id = p_org_id
     AND u.periodo_inicio >= p_periodo_inicio
     AND u.periodo_fim <= p_periodo_fim

  UNION ALL
  SELECT 'BP', 'custo', COALESCE(SUM(t.amount), 0), NULL, NULL
    FROM public.bp_transacoes t
   WHERE t.org_id = p_org_id
     AND t.transaction_date >= p_periodo_inicio::timestamptz
     AND t.transaction_date < (p_periodo_fim + 1)::timestamptz

  UNION ALL
  SELECT 'Repsol', 'custo', COALESCE(SUM(t.amount), 0), NULL, NULL
    FROM public.repsol_transacoes t
   WHERE t.org_id = p_org_id
     AND t.transaction_date >= p_periodo_inicio::timestamptz
     AND t.transaction_date < (p_periodo_fim + 1)::timestamptz

  UNION ALL
  SELECT 'EDP', 'custo', COALESCE(SUM(t.amount), 0), NULL, NULL
    FROM public.edp_transacoes t
   WHERE t.org_id = p_org_id
     AND t.transaction_date >= p_periodo_inicio::timestamptz
     AND t.transaction_date < (p_periodo_fim + 1)::timestamptz

  UNION ALL
  SELECT 'Via Verde', 'custo', COALESCE(SUM(t.amount), 0), NULL, NULL
    FROM public.via_verde_transacoes t
   WHERE t.org_id = p_org_id
     AND t.transaction_date >= p_periodo_inicio::timestamptz
     AND t.transaction_date < (p_periodo_fim + 1)::timestamptz;
END;
$$;
