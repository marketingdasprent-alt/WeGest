-- ============================================================
-- Integração de Taxas no contrato
-- ============================================================
-- 1) Trigger para preencher contrato_taxas.org_id a partir do contrato.
-- 2) Estende contrato_renting_totais para somar o custo das taxas.
--
-- Uma taxa é percentagem XOR valor fixo:
--   percentagem → subtotal × percentagem / 100
--   valor fixo  → valor_fixo
--
-- As taxas somam-se DEPOIS do IVA:
--   total = subtotal + IVA + Σ taxas
-- (o subtotal = aluguer + coberturas + extras, com desconto)
-- ============================================================


-- ============================================================
-- Trigger: preencher org_id de contrato_taxas a partir do contrato
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_contrato_taxa_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.contratos_renting WHERE id = NEW.contrato_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_taxas_set_org_id ON public.contrato_taxas;
CREATE TRIGGER trg_contrato_taxas_set_org_id
  BEFORE INSERT ON public.contrato_taxas
  FOR EACH ROW EXECUTE FUNCTION public.set_contrato_taxa_org_id();


-- ============================================================
-- View: contrato_renting_totais (coberturas + extras + taxas)
-- ============================================================
DROP VIEW IF EXISTS public.contrato_renting_totais;
CREATE VIEW public.contrato_renting_totais AS
WITH cob AS (
  SELECT contrato_id, COALESCE(SUM(preco_dia), 0) AS cob_preco_dia
  FROM public.contrato_coberturas
  GROUP BY contrato_id
),
ext AS (
  SELECT
    ce.contrato_id,
    COALESCE(SUM(
      CASE
        WHEN ce.tipo_calculo = 'fixo' THEN ce.preco_unidade * ce.quantidade
        ELSE ce.preco_unidade * ce.quantidade
             * public.fn_contrato_dias(c.data_inicio, c.data_fim)
      END
    ), 0) AS extra_custo
  FROM public.contrato_extras ce
  JOIN public.contratos_renting c ON c.id = ce.contrato_id
  GROUP BY ce.contrato_id
),
base AS (
  SELECT
    c.id AS contrato_id,
    c.estado_financeiro,
    public.fn_contrato_dias(c.data_inicio, c.data_fim) AS dias,
    COALESCE(cob.cob_preco_dia, 0)
      * public.fn_contrato_dias(c.data_inicio, c.data_fim) AS cobertura_custo,
    COALESCE(ext.extra_custo, 0) AS extra_custo,
    COALESCE(c.taxa_iva, 0) AS taxa_iva,
    c.total_subtotal AS snap_subtotal,
    c.total_iva AS snap_iva,
    c.total_final AS snap_final,
    c.facturado_em,
    -- Subtotal (com desconto) — base do cálculo das taxas percentuais
    ROUND(
      (
        COALESCE(c.valor_total_manual,
          COALESCE(c.tarifa_diaria, 0) * public.fn_contrato_dias(c.data_inicio, c.data_fim))
        + COALESCE(cob.cob_preco_dia, 0)
          * public.fn_contrato_dias(c.data_inicio, c.data_fim)
        + COALESCE(ext.extra_custo, 0)
      ) * (1 - COALESCE(c.desconto_percentagem, 0) / 100),
      2
    ) AS subtotal_pre
  FROM public.contratos_renting c
  LEFT JOIN cob ON cob.contrato_id = c.id
  LEFT JOIN ext ON ext.contrato_id = c.id
  WHERE c.deleted_at IS NULL
),
tax AS (
  SELECT
    ct.contrato_id,
    COALESCE(SUM(
      CASE
        WHEN ct.percentagem IS NOT NULL
          THEN ROUND(b.subtotal_pre * ct.percentagem / 100, 2)
        ELSE COALESCE(ct.valor_fixo, 0)
      END
    ), 0) AS taxa_custo
  FROM public.contrato_taxas ct
  JOIN base b ON b.contrato_id = ct.contrato_id
  GROUP BY ct.contrato_id
)
SELECT
  b.contrato_id,
  b.dias,
  b.estado_financeiro,
  b.cobertura_custo,
  b.extra_custo,
  COALESCE(t.taxa_custo, 0) AS taxa_custo,
  -- Subtotal (com desconto) — snapshot quando facturado
  CASE
    WHEN b.estado_financeiro = 'facturado' AND b.snap_subtotal IS NOT NULL THEN b.snap_subtotal
    ELSE b.subtotal_pre
  END AS subtotal,
  CASE
    WHEN b.estado_financeiro = 'facturado' AND b.snap_iva IS NOT NULL THEN b.snap_iva
    ELSE ROUND(b.subtotal_pre * (b.taxa_iva / 100), 2)
  END AS iva,
  -- Total = subtotal + IVA + taxas (taxas somam após IVA)
  CASE
    WHEN b.estado_financeiro = 'facturado' AND b.snap_final IS NOT NULL THEN b.snap_final
    ELSE ROUND(
      b.subtotal_pre * (1 + b.taxa_iva / 100) + COALESCE(t.taxa_custo, 0),
      2
    )
  END AS total,
  b.facturado_em,
  (b.estado_financeiro = 'facturado' AND b.snap_final IS NOT NULL) AS is_snapshot
FROM base b
LEFT JOIN tax t ON t.contrato_id = b.contrato_id;

COMMENT ON VIEW public.contrato_renting_totais IS
  'Totais do contrato (coberturas + extras + taxas). Taxas somam após IVA. '
  'Snapshot quando facturado. RLS via underlying table contratos_renting.';

ALTER VIEW public.contrato_renting_totais SET (security_invoker = true);
GRANT SELECT ON public.contrato_renting_totais TO authenticated;


-- ============================================================
-- Trigger de freeze: incluir custo das taxas no snapshot
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_contratos_renting_freeze_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_dias INTEGER;
  v_cobertura_custo NUMERIC(10, 2);
  v_extra_custo NUMERIC(10, 2);
  v_subtotal_bruto NUMERIC(10, 2);
  v_subtotal_final NUMERIC(10, 2);
  v_iva NUMERIC(10, 2);
  v_taxa_custo NUMERIC(10, 2);
  v_total NUMERIC(10, 2);
BEGIN
  IF NEW.estado_financeiro = 'facturado'
     AND (OLD.estado_financeiro IS DISTINCT FROM 'facturado'
          OR NEW.total_final IS NULL) THEN

    v_dias := public.fn_contrato_dias(NEW.data_inicio, NEW.data_fim);

    v_cobertura_custo := (
      SELECT COALESCE(SUM(preco_dia), 0) * v_dias
      FROM public.contrato_coberturas
      WHERE contrato_id = NEW.id
    );

    v_extra_custo := (
      SELECT COALESCE(SUM(
        CASE
          WHEN tipo_calculo = 'fixo' THEN preco_unidade * quantidade
          ELSE preco_unidade * quantidade * v_dias
        END
      ), 0)
      FROM public.contrato_extras
      WHERE contrato_id = NEW.id
    );

    v_subtotal_bruto := COALESCE(
      NEW.valor_total_manual,
      COALESCE(NEW.tarifa_diaria, 0) * v_dias
    ) + v_cobertura_custo + v_extra_custo;

    v_subtotal_final :=
      ROUND(v_subtotal_bruto * (1 - COALESCE(NEW.desconto_percentagem, 0) / 100), 2);
    v_iva := ROUND(v_subtotal_final * NEW.taxa_iva / 100, 2);

    v_taxa_custo := (
      SELECT COALESCE(SUM(
        CASE
          WHEN percentagem IS NOT NULL
            THEN ROUND(v_subtotal_final * percentagem / 100, 2)
          ELSE COALESCE(valor_fixo, 0)
        END
      ), 0)
      FROM public.contrato_taxas
      WHERE contrato_id = NEW.id
    );

    v_total := v_subtotal_final + v_iva + v_taxa_custo;

    NEW.total_subtotal := v_subtotal_final;
    NEW.total_iva := v_iva;
    NEW.total_final := v_total;
    NEW.facturado_em := COALESCE(NEW.facturado_em, timezone('utc', now()));
  END IF;

  IF OLD.estado_financeiro = 'facturado'
     AND NEW.estado_financeiro IN ('pendente', 'anulado') THEN
    NEW.total_subtotal := NULL;
    NEW.total_iva := NULL;
    NEW.total_final := NULL;
    NEW.facturado_em := NULL;
  END IF;

  RETURN NEW;
END;
$$;
