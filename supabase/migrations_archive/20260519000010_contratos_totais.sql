-- ============================================================
-- Migration: contratos_renting — cálculo de totais (v1.1)
-- ============================================================
-- Estratégia híbrida (decisão arquitectural roadmap §5.2):
--
--   • Contrato com estado_financeiro = 'pendente' / 'anulado':
--     totais calculados em tempo real via view `contrato_renting_totais`
--     (lê tarifa_diaria, valor_total_manual, desconto, IVA)
--
--   • Contrato com estado_financeiro = 'facturado' / 'pago':
--     totais snapshot persistido nas colunas total_subtotal/total_iva/
--     total_final/facturado_em (imutabilidade fiscal SAF-T).
--     A view devolve os snapshot se existirem, senão calcula.
--
-- Fase 1 (MVP): só tarifa_diaria × dias + desconto % + IVA.
-- Fase v1.2+: extras, taxas, coberturas — extender a view.
-- ============================================================


-- ============================================================
-- Função helper: número de dias (com ceil para horas residuais)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_contrato_dias(
  p_data_inicio TIMESTAMPTZ,
  p_data_fim TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  -- Ceil para garantir que 1 dia + 1 hora conta como 2 dias
  -- (alinhado com rent-a-car standard — cobra-se por dia iniciado)
  SELECT GREATEST(
    1,
    CEIL(EXTRACT(epoch FROM (p_data_fim - p_data_inicio)) / 86400)::integer
  );
$$;


-- ============================================================
-- View: contrato_renting_totais
-- Devolve totais calculados em tempo real OU snapshot se facturado.
-- ============================================================
CREATE OR REPLACE VIEW public.contrato_renting_totais AS
WITH calc AS (
  SELECT
    c.id AS contrato_id,
    c.estado_financeiro,
    public.fn_contrato_dias(c.data_inicio, c.data_fim) AS dias,
    -- Subtotal: valor manual sobrepõe cálculo automático
    COALESCE(
      c.valor_total_manual,
      COALESCE(c.tarifa_diaria, 0) * public.fn_contrato_dias(c.data_inicio, c.data_fim)
    ) AS subtotal_bruto,
    COALESCE(c.desconto_percentagem, 0) AS desconto_pct,
    c.taxa_iva,
    -- Snapshot
    c.total_subtotal AS snap_subtotal,
    c.total_iva AS snap_iva,
    c.total_final AS snap_final,
    c.facturado_em
  FROM public.contratos_renting c
  WHERE c.deleted_at IS NULL
)
SELECT
  contrato_id,
  dias,
  estado_financeiro,
  -- Quando facturado: usar snapshot. Senão: calcular.
  CASE
    WHEN estado_financeiro = 'facturado' AND snap_subtotal IS NOT NULL THEN snap_subtotal
    ELSE ROUND(subtotal_bruto * (1 - desconto_pct / 100), 2)
  END AS subtotal,
  CASE
    WHEN estado_financeiro = 'facturado' AND snap_iva IS NOT NULL THEN snap_iva
    ELSE ROUND(subtotal_bruto * (1 - desconto_pct / 100) * (taxa_iva / 100), 2)
  END AS iva,
  CASE
    WHEN estado_financeiro = 'facturado' AND snap_final IS NOT NULL THEN snap_final
    ELSE ROUND(subtotal_bruto * (1 - desconto_pct / 100) * (1 + taxa_iva / 100), 2)
  END AS total,
  facturado_em,
  -- Flag: distingue cálculo em tempo real de snapshot facturado
  (estado_financeiro = 'facturado' AND snap_final IS NOT NULL) AS is_snapshot
FROM calc;

COMMENT ON VIEW public.contrato_renting_totais IS
  'Totais do contrato. Devolve snapshot quando facturado, cálculo em tempo real caso contrário. '
  'Aplica RLS via underlying table contratos_renting.';

-- Garantir que a view herda as policies da tabela (security_invoker)
ALTER VIEW public.contrato_renting_totais SET (security_invoker = true);

GRANT SELECT ON public.contrato_renting_totais TO authenticated;


-- ============================================================
-- Trigger: congelar totais ao mudar estado_financeiro para 'facturado'
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_contratos_renting_freeze_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_dias INTEGER;
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
    v_subtotal_bruto := COALESCE(
      NEW.valor_total_manual,
      COALESCE(NEW.tarifa_diaria, 0) * v_dias
    );
    v_subtotal_final := ROUND(v_subtotal_bruto * (1 - COALESCE(NEW.desconto_percentagem, 0) / 100), 2);
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

DROP TRIGGER IF EXISTS trg_contratos_renting_freeze ON public.contratos_renting;
CREATE TRIGGER trg_contratos_renting_freeze
BEFORE UPDATE OF estado_financeiro, tarifa_diaria, desconto_percentagem, taxa_iva,
                 valor_total_manual, data_inicio, data_fim
ON public.contratos_renting
FOR EACH ROW
EXECUTE FUNCTION public.fn_contratos_renting_freeze_totals();

COMMENT ON FUNCTION public.fn_contratos_renting_freeze_totals IS
  'Congela total_subtotal/total_iva/total_final quando estado_financeiro vai para facturado. '
  'Limpa snapshot quando volta a pendente/anulado.';
