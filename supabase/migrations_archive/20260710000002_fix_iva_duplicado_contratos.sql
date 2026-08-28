-- ============================================================
-- Fix: contratos deixam de somar IVA a um preço que já o inclui
-- ============================================================
-- Bug reportado pelo dono do produto (2026-07-10): os preços das tarifas
-- (renting_tarifas / renting_tarifa_precos_modelo) já vêm com IVA incluído
-- — são o valor final a cobrar ao cliente. Mas o cálculo de totais do
-- CONTRATO tratava esse preço como se fosse uma base SEM IVA e somava
-- taxa_iva por cima (23% rent-a-car / 6% TVDE), inflacionando o valor
-- cobrado. Confirmado numa fatura real: o KeyInvoice recebeu o preço já-
-- com-IVA da tarifa como base e voltou a aplicar 23% — o cliente ficou
-- cobrado 23% a mais do que devia.
--
-- As RESERVAS já faziam isto correctamente — decompõem o valor final em
-- Incidência + IVA por DIVISÃO, sem nunca alterar o total:
--   subtotal_sem_iva = total_com_iva / (1 + taxa/100)
--   iva              = total_com_iva - subtotal_sem_iva
-- (ver ReservaResumoSidebar.tsx / ReservaFaturarDialog.tsx)
--
-- Esta migration aplica a mesma decomposição aos dois sítios do lado do
-- contrato que ainda somavam IVA por cima: a view em tempo real
-- (contrato_renting_totais) e o trigger que congela os totais fiscais
-- (SAF-T) no momento de facturar (fn_contratos_renting_freeze_totals).
-- O valor total cobrado ao cliente não muda para trás (é sempre o preço
-- da tarifa, com desconto); só passa a decompor correctamente em vez de
-- inflacionar.
--
-- IMPORTANTE: esta correcção só se aplica a contratos facturados A PARTIR
-- de agora. Contratos já facturados têm total_subtotal/total_iva/total_final
-- congelados (protegidos por SAF-T — não podem nem devem ser reescritos
-- silenciosamente). Se algum cliente foi realmente sobre-cobrado numa
-- fatura já emitida, a correcção correcta é uma nota de crédito (já existe
-- NotaCreditoDialog.tsx no contrato), não uma edição de dados históricos.
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
    public.fn_contrato_dias(c.data_inicio, c.data_fim) AS dias,
    COALESCE(cob.cob_preco_dia, 0)
      * public.fn_contrato_dias(c.data_inicio, c.data_fim) AS cobertura_custo,
    COALESCE(ext.extra_custo, 0) AS extra_custo,
    COALESCE(c.taxa_iva, 0) AS taxa_iva,
    c.total_subtotal AS snap_subtotal,
    c.total_iva AS snap_iva,
    c.total_final AS snap_final,
    c.facturado_em,
    -- Valor já com IVA incluído (preço da tarifa + coberturas + extras),
    -- com desconto aplicado. NÃO é uma base "sem IVA" — é o total a cobrar.
    ROUND(
      (
        COALESCE(c.valor_total_manual,
          COALESCE(c.tarifa_diaria, 0) * public.fn_contrato_dias(c.data_inicio, c.data_fim))
        + COALESCE(cob.cob_preco_dia, 0)
          * public.fn_contrato_dias(c.data_inicio, c.data_fim)
        + COALESCE(ext.extra_custo, 0)
      ) * (1 - COALESCE(c.desconto_percentagem, 0) / 100),
      2
    ) AS total_com_iva_pre
  FROM public.contratos_renting c
  LEFT JOIN cob ON cob.contrato_id = c.id
  LEFT JOIN ext ON ext.contrato_id = c.id
  WHERE c.deleted_at IS NULL
),
tax AS (
  -- Taxas administrativas incidem sobre o valor já-com-IVA (mesma base de
  -- sempre — isto não muda, só o cálculo do IVA em si é que muda abaixo).
  SELECT
    ct.contrato_id,
    COALESCE(SUM(
      CASE
        WHEN ct.percentagem IS NOT NULL
          THEN ROUND(b.total_com_iva_pre * ct.percentagem / 100, 2)
        ELSE COALESCE(ct.valor_fixo, 0)
      END
    ), 0) AS taxa_custo
  FROM public.contrato_taxas ct
  JOIN base b ON b.contrato_id = ct.contrato_id
  GROUP BY ct.contrato_id
),
decomp AS (
  -- Decompõe o valor já-com-IVA em Incidência (sem IVA) + IVA, por divisão —
  -- não altera o total, só separa os dois valores para a fatura.
  SELECT
    b.*,
    CASE WHEN b.taxa_iva > 0
      THEN ROUND(b.total_com_iva_pre / (1 + b.taxa_iva / 100), 2)
      ELSE b.total_com_iva_pre
    END AS subtotal_calc
  FROM base b
)
SELECT
  d.contrato_id,
  d.dias,
  d.estado_financeiro,
  d.cobertura_custo,
  d.extra_custo,
  COALESCE(t.taxa_custo, 0) AS taxa_custo,
  -- Subtotal (Incidência, sem IVA) — snapshot quando facturado
  CASE
    WHEN d.estado_financeiro = 'facturado' AND d.snap_subtotal IS NOT NULL THEN d.snap_subtotal
    ELSE d.subtotal_calc
  END AS subtotal,
  CASE
    WHEN d.estado_financeiro = 'facturado' AND d.snap_iva IS NOT NULL THEN d.snap_iva
    ELSE ROUND(d.total_com_iva_pre - d.subtotal_calc, 2)
  END AS iva,
  -- Total = valor já com IVA + taxas administrativas (somam por cima, sem
  -- voltar a somar IVA — o IVA já está incluído em total_com_iva_pre)
  CASE
    WHEN d.estado_financeiro = 'facturado' AND d.snap_final IS NOT NULL THEN d.snap_final
    ELSE ROUND(d.total_com_iva_pre + COALESCE(t.taxa_custo, 0), 2)
  END AS total,
  d.facturado_em,
  (d.estado_financeiro = 'facturado' AND d.snap_final IS NOT NULL) AS is_snapshot
FROM decomp d
LEFT JOIN tax t ON t.contrato_id = d.contrato_id;

COMMENT ON VIEW public.contrato_renting_totais IS
  'Totais do contrato (coberturas + extras + taxas). O preço da tarifa já inclui IVA — '
  'o IVA é decomposto (dividido), nunca somado por cima. Taxas administrativas somam-se '
  'ao valor já-com-IVA. Snapshot quando facturado. RLS via underlying table contratos_renting.';

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

    -- Valor já com IVA incluído (preço da tarifa), com desconto aplicado —
    -- é o valor a cobrar. Não é uma base "sem IVA".
    v_total_com_iva :=
      ROUND(v_subtotal_bruto * (1 - COALESCE(NEW.desconto_percentagem, 0) / 100), 2);

    -- Decompõe em Incidência (sem IVA) + IVA por divisão — não altera o
    -- valor cobrado, só separa os dois valores para a fatura.
    IF NEW.taxa_iva > 0 THEN
      v_subtotal_final := ROUND(v_total_com_iva / (1 + NEW.taxa_iva / 100), 2);
    ELSE
      v_subtotal_final := v_total_com_iva;
    END IF;
    v_iva := ROUND(v_total_com_iva - v_subtotal_final, 2);

    -- Taxas administrativas incidem sobre o valor já-com-IVA (mesma base de
    -- sempre) e somam-se por cima, sem voltar a somar IVA.
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
  'Congela total_subtotal/total_iva/total_final ao facturar um contrato (compliance SAF-T — '
  'imutável depois). O preço da tarifa já inclui IVA: o IVA é decomposto (dividido) em vez '
  'de somado por cima, para não duplicar o imposto. Fix 2026-07-10.';
