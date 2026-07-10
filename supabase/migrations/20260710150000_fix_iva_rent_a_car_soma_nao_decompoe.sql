-- ============================================================
-- Fix: IVA em Rent-a-Car deve ser SOMADO ao preço da tarifa, não
-- decomposto — o preço das tarifas Rent-a-Car vem SEM IVA.
-- ============================================================
-- A migration 20260710000002 (fix_iva_duplicado_contratos) assumiu que o
-- preço da tarifa já vinha COM IVA incluído, em todos os regimes, e
-- corrigiu a duplicação decompondo (dividindo) em vez de somar. Isso
-- estava certo para TVDE, mas errado para Rent-a-Car: confirmado pelo
-- dono do produto (2026-07-10) que TODAS as tarifas Rent-a-Car vêm SEM
-- IVA — o IVA tem de ser SOMADO no contrato/reserva, nunca decomposto.
--
-- Esta migration reintroduz a soma, mas SÓ para regime = 'rent_a_car'.
-- TVDE (e slot, tratado como TVDE por omissão) mantêm-se em decomposição,
-- exactamente como ficou na migration anterior — não foram postos em
-- causa.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) View contrato_renting_totais (totais em tempo real, antes de facturar)
-- ────────────────────────────────────────────────────────────
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
    c.regime,
    public.fn_contrato_dias(c.data_inicio, c.data_fim) AS dias,
    COALESCE(cob.cob_preco_dia, 0)
      * public.fn_contrato_dias(c.data_inicio, c.data_fim) AS cobertura_custo,
    COALESCE(ext.extra_custo, 0) AS extra_custo,
    COALESCE(c.taxa_iva, 0) AS taxa_iva,
    c.total_subtotal AS snap_subtotal,
    c.total_iva AS snap_iva,
    c.total_final AS snap_final,
    c.facturado_em,
    -- Base com desconto aplicado. Rent-a-Car: isto é o subtotal SEM IVA.
    -- TVDE/slot: isto é o total JÁ COM IVA (decompõe-se a seguir).
    ROUND(
      (
        COALESCE(c.valor_total_manual,
          COALESCE(c.tarifa_diaria, 0) * public.fn_contrato_dias(c.data_inicio, c.data_fim))
        + COALESCE(cob.cob_preco_dia, 0)
          * public.fn_contrato_dias(c.data_inicio, c.data_fim)
        + COALESCE(ext.extra_custo, 0)
      ) * (1 - COALESCE(c.desconto_percentagem, 0) / 100),
      2
    ) AS subtotal_bruto_desc
  FROM public.contratos_renting c
  LEFT JOIN cob ON cob.contrato_id = c.id
  LEFT JOIN ext ON ext.contrato_id = c.id
  WHERE c.deleted_at IS NULL
),
decomp AS (
  -- Rent-a-Car: subtotal_bruto_desc É o subtotal (sem IVA) — soma-se o
  -- IVA por cima para chegar ao total. TVDE/slot: subtotal_bruto_desc É o
  -- total (já com IVA) — decompõe-se (divide) para separar Incidência+IVA,
  -- sem alterar o total.
  SELECT
    b.*,
    CASE
      WHEN b.regime = 'rent_a_car' THEN b.subtotal_bruto_desc
      WHEN b.taxa_iva > 0 THEN ROUND(b.subtotal_bruto_desc / (1 + b.taxa_iva / 100), 2)
      ELSE b.subtotal_bruto_desc
    END AS subtotal_calc,
    CASE
      WHEN b.regime = 'rent_a_car' AND b.taxa_iva > 0
        THEN ROUND(b.subtotal_bruto_desc * (1 + b.taxa_iva / 100), 2)
      ELSE b.subtotal_bruto_desc
    END AS total_com_iva
  FROM base b
),
tax AS (
  -- Taxas administrativas incidem sobre o valor já-com-IVA, em ambos os
  -- sentidos (soma ou decomposição) — mesma base de sempre.
  SELECT
    ct.contrato_id,
    COALESCE(SUM(
      CASE
        WHEN ct.percentagem IS NOT NULL
          THEN ROUND(d.total_com_iva * ct.percentagem / 100, 2)
        ELSE COALESCE(ct.valor_fixo, 0)
      END
    ), 0) AS taxa_custo
  FROM public.contrato_taxas ct
  JOIN decomp d ON d.contrato_id = ct.contrato_id
  GROUP BY ct.contrato_id
)
SELECT
  d.contrato_id,
  d.dias,
  d.estado_financeiro,
  d.cobertura_custo,
  d.extra_custo,
  COALESCE(t.taxa_custo, 0) AS taxa_custo,
  CASE
    WHEN d.estado_financeiro = 'facturado' AND d.snap_subtotal IS NOT NULL THEN d.snap_subtotal
    ELSE d.subtotal_calc
  END AS subtotal,
  CASE
    WHEN d.estado_financeiro = 'facturado' AND d.snap_iva IS NOT NULL THEN d.snap_iva
    ELSE ROUND(d.total_com_iva - d.subtotal_calc, 2)
  END AS iva,
  CASE
    WHEN d.estado_financeiro = 'facturado' AND d.snap_final IS NOT NULL THEN d.snap_final
    ELSE ROUND(d.total_com_iva + COALESCE(t.taxa_custo, 0), 2)
  END AS total,
  d.facturado_em,
  (d.estado_financeiro = 'facturado' AND d.snap_final IS NOT NULL) AS is_snapshot
FROM decomp d
LEFT JOIN tax t ON t.contrato_id = d.contrato_id;

COMMENT ON VIEW public.contrato_renting_totais IS
  'Totais do contrato (coberturas + extras + taxas). Rent-a-Car: o preço da tarifa é '
  'SEM IVA — soma-se por cima. TVDE/slot: o preço já vem com IVA incluído — decompõe-se '
  '(divide), nunca soma. Snapshot quando facturado. RLS via underlying table contratos_renting.';

ALTER VIEW public.contrato_renting_totais SET (security_invoker = true);
GRANT SELECT ON public.contrato_renting_totais TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 2) Trigger de freeze — congela os totais fiscais ao facturar
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_contratos_renting_freeze_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_dias INTEGER;
  v_cobertura_custo NUMERIC(10, 2);
  v_extra_custo NUMERIC(10, 2);
  v_subtotal_bruto NUMERIC(10, 2);
  v_total_com_iva NUMERIC(10, 2);
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

    IF NEW.regime = 'rent_a_car' THEN
      -- Rent-a-Car: o preço da tarifa é SEM IVA — soma-se o IVA por cima.
      v_subtotal_final := ROUND(v_subtotal_bruto * (1 - COALESCE(NEW.desconto_percentagem, 0) / 100), 2);
      v_iva := CASE WHEN NEW.taxa_iva > 0 THEN ROUND(v_subtotal_final * NEW.taxa_iva / 100, 2) ELSE 0 END;
      v_total_com_iva := v_subtotal_final + v_iva;
    ELSE
      -- TVDE/slot: o preço já vem com IVA incluído — decompõe-se, não se soma.
      v_total_com_iva :=
        ROUND(v_subtotal_bruto * (1 - COALESCE(NEW.desconto_percentagem, 0) / 100), 2);
      IF NEW.taxa_iva > 0 THEN
        v_subtotal_final := ROUND(v_total_com_iva / (1 + NEW.taxa_iva / 100), 2);
      ELSE
        v_subtotal_final := v_total_com_iva;
      END IF;
      v_iva := ROUND(v_total_com_iva - v_subtotal_final, 2);
    END IF;

    v_taxa_custo := (
      SELECT COALESCE(SUM(
        CASE
          WHEN percentagem IS NOT NULL
            THEN ROUND(v_total_com_iva * percentagem / 100, 2)
          ELSE COALESCE(valor_fixo, 0)
        END
      ), 0)
      FROM public.contrato_taxas
      WHERE contrato_id = NEW.id
    );

    v_total := v_total_com_iva + v_taxa_custo;

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

COMMENT ON FUNCTION public.fn_contratos_renting_freeze_totals() IS
  'Congela total_subtotal/total_iva/total_final ao facturar (compliance SAF-T — imutável '
  'depois). Rent-a-Car: preço da tarifa é sem IVA, soma-se por cima. TVDE/slot: preço já '
  'com IVA incluído, decompõe-se. Fix 2026-07-10 (regime-aware).';
