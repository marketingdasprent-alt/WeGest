-- ============================================================
-- Integração de Extras no contrato
-- ============================================================
-- 1) Trigger para preencher contrato_extras.org_id a partir do
--    contrato (a tabela do colega não tem default nem trigger).
-- 2) Estende a view contrato_renting_totais para somar o custo
--    dos extras ao subtotal.
--
-- Custo de um extra:
--   tipo_calculo = 'dia'  → preco_unidade × quantidade × dias
--   tipo_calculo = 'fixo' → preco_unidade × quantidade
-- ============================================================


-- ============================================================
-- Trigger: preencher org_id de contrato_extras a partir do contrato
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_contrato_extra_org_id()
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

DROP TRIGGER IF EXISTS trg_contrato_extras_set_org_id ON public.contrato_extras;
CREATE TRIGGER trg_contrato_extras_set_org_id
  BEFORE INSERT ON public.contrato_extras
  FOR EACH ROW EXECUTE FUNCTION public.set_contrato_extra_org_id();


-- ============================================================
-- View: contrato_renting_totais (recriada com coberturas + extras)
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
    -- Extras 'fixo' = preço × quantidade ; 'dia' = preço × quantidade × dias
    COALESCE(SUM(
      CASE
        WHEN ce.tipo_calculo = 'fixo'
          THEN ce.preco_unidade * ce.quantidade
        ELSE ce.preco_unidade * ce.quantidade
             * public.fn_contrato_dias(c.data_inicio, c.data_fim)
      END
    ), 0) AS extra_custo
  FROM public.contrato_extras ce
  JOIN public.contratos_renting c ON c.id = ce.contrato_id
  GROUP BY ce.contrato_id
),
calc AS (
  SELECT
    c.id AS contrato_id,
    c.estado_financeiro,
    public.fn_contrato_dias(c.data_inicio, c.data_fim) AS dias,
    COALESCE(cob.cob_preco_dia, 0)
      * public.fn_contrato_dias(c.data_inicio, c.data_fim) AS cobertura_custo,
    COALESCE(ext.extra_custo, 0) AS extra_custo,
    COALESCE(
      c.valor_total_manual,
      COALESCE(c.tarifa_diaria, 0) * public.fn_contrato_dias(c.data_inicio, c.data_fim)
    ) AS base_aluguer,
    COALESCE(c.desconto_percentagem, 0) AS desconto_pct,
    c.taxa_iva,
    c.total_subtotal AS snap_subtotal,
    c.total_iva AS snap_iva,
    c.total_final AS snap_final,
    c.facturado_em
  FROM public.contratos_renting c
  LEFT JOIN cob ON cob.contrato_id = c.id
  LEFT JOIN ext ON ext.contrato_id = c.id
  WHERE c.deleted_at IS NULL
)
SELECT
  contrato_id,
  dias,
  estado_financeiro,
  cobertura_custo,
  extra_custo,
  -- Subtotal (com desconto) = (base + coberturas + extras) × (1 - desconto%)
  CASE
    WHEN estado_financeiro = 'facturado' AND snap_subtotal IS NOT NULL THEN snap_subtotal
    ELSE ROUND((base_aluguer + cobertura_custo + extra_custo) * (1 - desconto_pct / 100), 2)
  END AS subtotal,
  CASE
    WHEN estado_financeiro = 'facturado' AND snap_iva IS NOT NULL THEN snap_iva
    ELSE ROUND(
      (base_aluguer + cobertura_custo + extra_custo)
        * (1 - desconto_pct / 100) * (taxa_iva / 100),
      2
    )
  END AS iva,
  CASE
    WHEN estado_financeiro = 'facturado' AND snap_final IS NOT NULL THEN snap_final
    ELSE ROUND(
      (base_aluguer + cobertura_custo + extra_custo)
        * (1 - desconto_pct / 100) * (1 + taxa_iva / 100),
      2
    )
  END AS total,
  facturado_em,
  (estado_financeiro = 'facturado' AND snap_final IS NOT NULL) AS is_snapshot
FROM calc;

COMMENT ON VIEW public.contrato_renting_totais IS
  'Totais do contrato (inclui coberturas + extras). Snapshot quando facturado, '
  'cálculo em tempo real caso contrário. RLS via underlying table contratos_renting.';

ALTER VIEW public.contrato_renting_totais SET (security_invoker = true);
GRANT SELECT ON public.contrato_renting_totais TO authenticated;


-- ============================================================
-- Trigger de freeze: incluir custo dos extras no snapshot
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
    v_total := v_subtotal_final + v_iva;

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
