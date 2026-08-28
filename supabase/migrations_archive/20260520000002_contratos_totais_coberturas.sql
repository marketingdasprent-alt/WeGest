-- ============================================================
-- Migration: contrato_renting_totais — incluir custo das coberturas
-- ============================================================
-- Estende o cálculo de totais para somar o custo das coberturas:
--   custo_coberturas = SUM(contrato_coberturas.preco_dia) × dias
--
-- Subtotal passa a ser:  (base_aluguer + custo_coberturas)
--   • base_aluguer = valor_total_manual  OU  tarifa_diaria × dias
--   • desconto % e IVA aplicam-se ao subtotal completo
--
-- Extras e taxas entram aqui da mesma forma quando essas sub-tabs
-- do contrato forem construídas.
-- ============================================================


-- ============================================================
-- View: contrato_renting_totais (recriada com coberturas)
-- ------------------------------------------------------------
-- DROP + CREATE (em vez de CREATE OR REPLACE) porque a coluna nova
-- cobertura_custo é inserida no meio — CREATE OR REPLACE só permite
-- acrescentar colunas no fim.
-- ============================================================
DROP VIEW IF EXISTS public.contrato_renting_totais;
CREATE VIEW public.contrato_renting_totais AS
WITH cob AS (
  SELECT contrato_id, COALESCE(SUM(preco_dia), 0) AS cob_preco_dia
  FROM public.contrato_coberturas
  GROUP BY contrato_id
),
calc AS (
  SELECT
    c.id AS contrato_id,
    c.estado_financeiro,
    public.fn_contrato_dias(c.data_inicio, c.data_fim) AS dias,
    -- Custo das coberturas = SUM(preco_dia) × dias
    COALESCE(cob.cob_preco_dia, 0)
      * public.fn_contrato_dias(c.data_inicio, c.data_fim) AS cobertura_custo,
    -- Base do aluguer: valor manual sobrepõe tarifa × dias
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
  WHERE c.deleted_at IS NULL
)
SELECT
  contrato_id,
  dias,
  estado_financeiro,
  cobertura_custo,
  -- Subtotal (com desconto) = (base + coberturas) × (1 - desconto%)
  CASE
    WHEN estado_financeiro = 'facturado' AND snap_subtotal IS NOT NULL THEN snap_subtotal
    ELSE ROUND((base_aluguer + cobertura_custo) * (1 - desconto_pct / 100), 2)
  END AS subtotal,
  CASE
    WHEN estado_financeiro = 'facturado' AND snap_iva IS NOT NULL THEN snap_iva
    ELSE ROUND((base_aluguer + cobertura_custo) * (1 - desconto_pct / 100) * (taxa_iva / 100), 2)
  END AS iva,
  CASE
    WHEN estado_financeiro = 'facturado' AND snap_final IS NOT NULL THEN snap_final
    ELSE ROUND(
      (base_aluguer + cobertura_custo) * (1 - desconto_pct / 100) * (1 + taxa_iva / 100),
      2
    )
  END AS total,
  facturado_em,
  (estado_financeiro = 'facturado' AND snap_final IS NOT NULL) AS is_snapshot
FROM calc;

COMMENT ON VIEW public.contrato_renting_totais IS
  'Totais do contrato (inclui custo das coberturas). Snapshot quando facturado, '
  'cálculo em tempo real caso contrário. RLS via underlying table contratos_renting.';

ALTER VIEW public.contrato_renting_totais SET (security_invoker = true);
GRANT SELECT ON public.contrato_renting_totais TO authenticated;


-- ============================================================
-- Trigger de freeze: incluir custo das coberturas no snapshot
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_contratos_renting_freeze_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_dias INTEGER;
  v_cobertura_custo NUMERIC(10, 2);
  v_subtotal_bruto NUMERIC(10, 2);
  v_subtotal_final NUMERIC(10, 2);
  v_iva NUMERIC(10, 2);
  v_total NUMERIC(10, 2);
BEGIN
  -- Só age quando passa para 'facturado'
  IF NEW.estado_financeiro = 'facturado'
     AND (OLD.estado_financeiro IS DISTINCT FROM 'facturado'
          OR NEW.total_final IS NULL) THEN

    v_dias := public.fn_contrato_dias(NEW.data_inicio, NEW.data_fim);

    v_cobertura_custo := (
      SELECT COALESCE(SUM(preco_dia), 0) * v_dias
      FROM public.contrato_coberturas
      WHERE contrato_id = NEW.id
    );

    v_subtotal_bruto := COALESCE(
      NEW.valor_total_manual,
      COALESCE(NEW.tarifa_diaria, 0) * v_dias
    ) + v_cobertura_custo;

    v_subtotal_final :=
      ROUND(v_subtotal_bruto * (1 - COALESCE(NEW.desconto_percentagem, 0) / 100), 2);
    v_iva := ROUND(v_subtotal_final * NEW.taxa_iva / 100, 2);
    v_total := v_subtotal_final + v_iva;

    NEW.total_subtotal := v_subtotal_final;
    NEW.total_iva := v_iva;
    NEW.total_final := v_total;
    NEW.facturado_em := COALESCE(NEW.facturado_em, timezone('utc', now()));
  END IF;

  -- Quando volta a 'pendente' / 'anulado', limpar snapshot
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
