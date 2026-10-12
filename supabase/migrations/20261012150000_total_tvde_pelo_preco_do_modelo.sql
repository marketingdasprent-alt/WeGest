-- O total da lista de contratos de um TVDE é o preço semanal da tarifa para o
-- modelo da viatura, quando não há valor acordado.
--
-- A vista só sabia `tarifa_diaria × dias`. Num TVDE a tarifa não tem preço por
-- dia (o preço é por modelo, em renting_tarifa_precos_modelo) e não há data de
-- fim: o total saía 0,00 € com o contrato a cobrar 475 €/semana (#421, 14
-- TVDE em curso a 2026-10-12). Mesma regra que calcularBaseAluguerRenting usa
-- no formulário. Rent-a-car fica como estava.

CREATE OR REPLACE VIEW public.contrato_renting_totais
WITH (security_invoker = true) AS
 WITH cob AS (
         SELECT contrato_coberturas.contrato_id,
            COALESCE(sum(contrato_coberturas.preco_dia), 0::numeric) AS cob_preco_dia
           FROM contrato_coberturas
          GROUP BY contrato_coberturas.contrato_id
        ), ext AS (
         SELECT ce.contrato_id,
            COALESCE(sum(
                CASE
                    WHEN ce.tipo_calculo = 'fixo'::text THEN ce.preco_unidade * ce.quantidade::numeric
                    ELSE ce.preco_unidade * ce.quantidade::numeric * fn_contrato_dias(c.data_inicio, c.data_fim)::numeric
                END), 0::numeric) AS extra_custo
           FROM contrato_extras ce
             JOIN contratos_renting c ON c.id = ce.contrato_id
          GROUP BY ce.contrato_id
        ), base AS (
         SELECT c.id AS contrato_id,
            c.estado_financeiro,
            c.regime,
            fn_contrato_dias(c.data_inicio, c.data_fim) AS dias,
            COALESCE(cob.cob_preco_dia, 0::numeric) * fn_contrato_dias(c.data_inicio, c.data_fim)::numeric AS cobertura_custo,
            COALESCE(ext.extra_custo, 0::numeric) AS extra_custo,
            COALESCE(c.taxa_iva, 0::numeric) AS taxa_iva,
            c.total_subtotal AS snap_subtotal,
            c.total_iva AS snap_iva,
            c.total_final AS snap_final,
            c.facturado_em,
            round((COALESCE(
                c.valor_total_manual,
                CASE WHEN c.regime = 'tvde'::contrato_regime_enum THEN pm.preco_semana END,
                COALESCE(c.tarifa_diaria, 0::numeric) * fn_contrato_dias(c.data_inicio, c.data_fim)::numeric
              ) + COALESCE(cob.cob_preco_dia, 0::numeric) * fn_contrato_dias(c.data_inicio, c.data_fim)::numeric + COALESCE(ext.extra_custo, 0::numeric)) * (1::numeric - COALESCE(c.desconto_percentagem, 0::numeric) / 100::numeric), 2) AS subtotal_bruto_desc
           FROM contratos_renting c
             LEFT JOIN cob ON cob.contrato_id = c.id
             LEFT JOIN ext ON ext.contrato_id = c.id
             LEFT JOIN viaturas v ON v.id = c.viatura_id
             LEFT JOIN renting_tarifa_precos_modelo pm ON pm.tarifa_id = c.tarifa_id AND pm.modelo_id = v.modelo_id
          WHERE c.deleted_at IS NULL
        ), decomp AS (
         SELECT b.contrato_id,
            b.estado_financeiro,
            b.regime,
            b.dias,
            b.cobertura_custo,
            b.extra_custo,
            b.taxa_iva,
            b.snap_subtotal,
            b.snap_iva,
            b.snap_final,
            b.facturado_em,
            b.subtotal_bruto_desc,
                CASE
                    WHEN b.regime = 'rent_a_car'::contrato_regime_enum THEN b.subtotal_bruto_desc
                    WHEN b.taxa_iva > 0::numeric THEN round(b.subtotal_bruto_desc / (1::numeric + b.taxa_iva / 100::numeric), 2)
                    ELSE b.subtotal_bruto_desc
                END AS subtotal_calc,
                CASE
                    WHEN b.regime = 'rent_a_car'::contrato_regime_enum AND b.taxa_iva > 0::numeric THEN round(b.subtotal_bruto_desc * (1::numeric + b.taxa_iva / 100::numeric), 2)
                    ELSE b.subtotal_bruto_desc
                END AS total_com_iva
           FROM base b
        ), tax AS (
         SELECT ct.contrato_id,
            COALESCE(sum(
                CASE
                    WHEN ct.percentagem IS NOT NULL THEN round(d_1.total_com_iva * ct.percentagem / 100::numeric, 2)
                    ELSE COALESCE(ct.valor_fixo, 0::numeric)
                END), 0::numeric) AS taxa_custo
           FROM contrato_taxas ct
             JOIN decomp d_1 ON d_1.contrato_id = ct.contrato_id
          GROUP BY ct.contrato_id
        )
 SELECT d.contrato_id,
    d.dias,
    d.estado_financeiro,
    d.cobertura_custo,
    d.extra_custo,
    COALESCE(t.taxa_custo, 0::numeric) AS taxa_custo,
        CASE
            WHEN d.estado_financeiro = 'facturado'::contrato_estado_financeiro_enum AND d.snap_subtotal IS NOT NULL THEN d.snap_subtotal
            ELSE d.subtotal_calc
        END AS subtotal,
        CASE
            WHEN d.estado_financeiro = 'facturado'::contrato_estado_financeiro_enum AND d.snap_iva IS NOT NULL THEN d.snap_iva
            ELSE round(d.total_com_iva - d.subtotal_calc, 2)
        END AS iva,
        CASE
            WHEN d.estado_financeiro = 'facturado'::contrato_estado_financeiro_enum AND d.snap_final IS NOT NULL THEN d.snap_final
            ELSE round(d.total_com_iva + COALESCE(t.taxa_custo, 0::numeric), 2)
        END AS total,
    d.facturado_em,
    d.estado_financeiro = 'facturado'::contrato_estado_financeiro_enum AND d.snap_final IS NOT NULL AS is_snapshot
   FROM decomp d
     LEFT JOIN tax t ON t.contrato_id = d.contrato_id;

NOTIFY pgrst, 'reload schema';
