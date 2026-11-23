-- Preço semanal do TVDE: a tarifa é o preço vivo; um preço diferente só por
-- pedido aprovado (preco_semana_acordado). A base do aluguer passa a seguir a
-- mesma ordem do fecho semanal em três sítios que a ignoravam:
--   * fn_contratos_renting_freeze_totals e contrato_renting_totais: valor manual
--     > 0 nunca é substituído; TVDE sem ele usa acordado, tarifa, preço do modelo
--     (sem nenhum, fica tarifa_diaria x dias como antes). A vista ignorava o acordado.
--   * fn_aplicar_preco_semana_negociado: aplica no próprio contrato quando ainda
--     não fechou nenhuma semana (também agendado); só reescreve valor_total_manual
--     se este era vazio ou igual ao preço semanal antigo (protege a renda mensal
--     facturada a empresas). Só muda no próprio contrato quando se prova que
--     nenhuma semana foi contada (contrato com <= 1 semana, sem resumo, líquido
--     ou cobrança, nem nas versões anteriores); senão, versão nova.
-- Base: baseline (freeze), 20261012150000 (vista), 20261019100000 (aplicar).

CREATE OR REPLACE FUNCTION public.fn_contratos_renting_freeze_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
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
  v_base NUMERIC;
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

    -- Base do aluguer. Valor manual > 0 nunca se substitui (renda mensal a
    -- empresa, snapshot semanal). TVDE sem ele: preço semanal pela ordem do
    -- fecho (acordado, tarifa, tarifa para o modelo); se nenhum existir, o
    -- comportamento anterior (tarifa_diaria x dias).
    IF COALESCE(NEW.valor_total_manual, 0) > 0 THEN
      v_base := NEW.valor_total_manual;
    ELSIF lower(btrim(NEW.regime::text)) = 'tvde' THEN
      v_base := COALESCE(
        NEW.preco_semana_acordado,
        NULLIF((SELECT t.preco_semana FROM public.renting_tarifas t WHERE t.id = NEW.tarifa_id), 0),
        (SELECT pm.preco_semana
           FROM public.renting_tarifa_precos_modelo pm
           JOIN public.viaturas v ON v.id = NEW.viatura_id AND v.modelo_id = pm.modelo_id
          WHERE pm.tarifa_id = NEW.tarifa_id
          LIMIT 1),
        COALESCE(NEW.tarifa_diaria, 0) * v_dias
      );
    ELSE
      v_base := COALESCE(NEW.valor_total_manual, COALESCE(NEW.tarifa_diaria, 0) * v_dias);
    END IF;

    v_subtotal_bruto := v_base + v_cobertura_custo + v_extra_custo;

    IF NEW.regime = 'rent_a_car' THEN
      v_subtotal_final := ROUND(v_subtotal_bruto * (1 - COALESCE(NEW.desconto_percentagem, 0) / 100), 2);
      v_iva := CASE WHEN NEW.taxa_iva > 0 THEN ROUND(v_subtotal_final * NEW.taxa_iva / 100, 2) ELSE 0 END;
      v_total_com_iva := v_subtotal_final + v_iva;
    ELSE
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
$function$;

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
            round((CASE
                WHEN c.valor_total_manual > 0::numeric THEN c.valor_total_manual
                WHEN lower(btrim(c.regime::text)) = 'tvde' THEN COALESCE(
                    c.preco_semana_acordado,
                    NULLIF(rt.preco_semana, 0::numeric),
                    pm.preco_semana,
                    COALESCE(c.tarifa_diaria, 0::numeric) * fn_contrato_dias(c.data_inicio, c.data_fim)::numeric)
                ELSE COALESCE(
                    c.valor_total_manual,
                    COALESCE(c.tarifa_diaria, 0::numeric) * fn_contrato_dias(c.data_inicio, c.data_fim)::numeric)
              END + COALESCE(cob.cob_preco_dia, 0::numeric) * fn_contrato_dias(c.data_inicio, c.data_fim)::numeric + COALESCE(ext.extra_custo, 0::numeric)) * (1::numeric - COALESCE(c.desconto_percentagem, 0::numeric) / 100::numeric), 2) AS subtotal_bruto_desc
           FROM contratos_renting c
             LEFT JOIN cob ON cob.contrato_id = c.id
             LEFT JOIN ext ON ext.contrato_id = c.id
             LEFT JOIN viaturas v ON v.id = c.viatura_id
             LEFT JOIN renting_tarifas rt ON rt.id = c.tarifa_id
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

CREATE OR REPLACE FUNCTION public.fn_aplicar_preco_semana_negociado(
  p_contrato_id uuid,
  p_preco numeric,
  p_pedido_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_old    public.contratos_renting%ROWTYPE;
  v_user   uuid := auth.uid();
  v_desde  timestamptz :=
    date_trunc('week', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon';
  v_new_id uuid;
  v_cols   text;
  v_vals   text;
  v_preco_antigo   numeric;
  v_atualiza_manual boolean;
  v_manual_expr    text;
  v_no_sitio       boolean;
BEGIN
  IF p_preco IS NULL OR p_preco < 0 THEN
    RAISE EXCEPTION 'O preço semanal tem de ser um valor igual ou superior a 0.';
  END IF;

  SELECT * INTO v_old FROM public.contratos_renting WHERE id = p_contrato_id FOR UPDATE;

  IF NOT FOUND OR v_old.deleted_at IS NOT NULL OR v_old.substituido_em IS NOT NULL THEN
    RAISE EXCEPTION 'O contrato deste pedido já não está em vigor.';
  END IF;
  IF v_old.regime IS DISTINCT FROM 'tvde' THEN
    RAISE EXCEPTION 'O preço semanal só se negoceia em contratos TVDE.';
  END IF;
  IF v_old.estado_financeiro IN ('facturado', 'pago') THEN
    RAISE EXCEPTION 'O contrato #% está %. Trata da factura antes de aceitar o preço novo.',
      v_old.codigo, v_old.estado_financeiro;
  END IF;

  -- Preço semanal em vigor antes deste pedido, pela ordem do fecho semanal:
  -- acordado (0 vale), preço da tarifa, preço da tarifa para o modelo.
  v_preco_antigo := COALESCE(
    v_old.preco_semana_acordado,
    NULLIF((SELECT t.preco_semana FROM public.renting_tarifas t WHERE t.id = v_old.tarifa_id), 0),
    (SELECT pm.preco_semana
       FROM public.renting_tarifa_precos_modelo pm
       JOIN public.viaturas v ON v.id = v_old.viatura_id AND v.modelo_id = pm.modelo_id
      WHERE pm.tarifa_id = v_old.tarifa_id
      LIMIT 1));

  -- Só acompanha o preço o valor do contrato que era o preço semanal (ou vazio).
  -- Um valor diferente (renda mensal facturada a uma empresa) não se mexe.
  v_atualiza_manual := COALESCE(
    COALESCE(v_old.valor_total_manual, 0) = 0
      OR v_old.valor_total_manual = v_preco_antigo,
    false);
  v_manual_expr := CASE WHEN v_atualiza_manual THEN '$6' ELSE 'valor_total_manual' END;

  -- No próprio sítio quando começou esta semana (regra anterior) ou quando se
  -- PROVA que nenhuma semana foi contada: o contrato tem no máximo uma semana,
  -- ainda está vivo, e nem ele, nem as versões anteriores, nem os seus
  -- condutores têm resumo, líquido semanal ou cobrança de semana passada. Sem prova, versão nova:
  -- o Contas/Resumo recalcula as semanas passadas a partir do contrato.
  v_no_sitio := v_old.data_inicio >= v_desde
    OR (
      v_old.estado_operacional IN ('agendado', 'em_curso')
      AND (v_old.data_fim IS NULL OR v_old.data_fim > v_desde)
      AND v_old.data_inicio >= v_desde - interval '7 days'
      AND NOT EXISTS (
        WITH RECURSIVE cadeia(cid) AS (
          SELECT v_old.id
          UNION
          SELECT c.contrato_anterior_id
            FROM public.contratos_renting c
            JOIN cadeia ON c.id = cadeia.cid
           WHERE c.contrato_anterior_id IS NOT NULL)
        SELECT 1 FROM public.motorista_resumo_semanal r
         WHERE r.contrato_id IN (SELECT cid FROM cadeia))
      AND NOT EXISTS (
        SELECT 1
          FROM public.contrato_condutores cc
          JOIN public.motorista_resumo_semanal r ON r.motorista_id = cc.motorista_id
         WHERE cc.contrato_id = v_old.id
           AND r.semana_fim >= (v_old.data_inicio AT TIME ZONE 'Europe/Lisbon')::date)
      AND NOT EXISTS (
        SELECT 1
          FROM public.contrato_condutores cc
          JOIN public.motorista_liquido_semanal l ON l.motorista_id = cc.motorista_id
         WHERE cc.contrato_id = v_old.id
           AND l.semana_fim >= (v_old.data_inicio AT TIME ZONE 'Europe/Lisbon')::date)
      AND NOT EXISTS (
        -- Só conta a cobrança semanal automática de uma semana já passada; as
        -- geradas à frente (periodo_de >= segunda-feira) ainda se reprecificam.
        SELECT 1 FROM public.contrato_cobrancas cb
         WHERE cb.contrato_id = v_old.id
           AND cb.tipo_cobranca = 'tvde_semanal'
           AND cb.manual = false
           AND cb.estado <> 'anulada'
           AND cb.periodo_de < (v_desde AT TIME ZONE 'Europe/Lisbon')::date)
    );

  IF v_no_sitio THEN
    UPDATE public.contratos_renting
       SET preco_semana_acordado = p_preco,
           valor_total_manual    = CASE WHEN v_atualiza_manual THEN p_preco ELSE valor_total_manual END,
           updated_by            = v_user
     WHERE id = v_old.id;

    INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
    VALUES (v_old.id, v_old.org_id, 'alteracao', v_user,
            format('Preço semanal negociado: %s € (pedido %s).', p_preco, p_pedido_id));
    RETURN v_old.id;
  END IF;

  IF v_old.estado_operacional <> 'em_curso' THEN
    RAISE EXCEPTION 'O contrato #% não está em curso (estado: %).',
      v_old.codigo, v_old.estado_operacional;
  END IF;
  IF v_old.data_fim IS NOT NULL AND v_old.data_fim <= v_desde THEN
    RAISE EXCEPTION 'O contrato #% terminou a %. Renova-o antes de mudar o preço.',
      v_old.codigo, to_char(v_old.data_fim AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.contratos_renting
     SET substituido_em     = now(),
         estado_operacional = 'fechado'::contrato_estado_operacional_enum,
         data_fim           = v_desde,
         updated_by         = v_user
   WHERE id = v_old.id;

  -- Cópia de todas as colunas, como em renovar_contrato_renting.
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position),
         string_agg(
           CASE c.column_name
             WHEN 'versao'                THEN '$2'
             WHEN 'contrato_anterior_id'  THEN '$1'
             WHEN 'motivo_versao'         THEN '$3'
             WHEN 'substituido_em'        THEN 'NULL'
             WHEN 'deleted_at'            THEN 'NULL'
             WHEN 'data_inicio'           THEN '$4'
             WHEN 'data_fim'              THEN 'NULL'
             WHEN 'preco_semana_acordado' THEN '$6'
             WHEN 'valor_total_manual'    THEN v_manual_expr
             WHEN 'estado_operacional'    THEN '''em_curso''::contrato_estado_operacional_enum'
             WHEN 'estado_financeiro'     THEN '''pendente''::contrato_estado_financeiro_enum'
             WHEN 'facturado_em'          THEN 'NULL'
             WHEN 'total_subtotal'        THEN 'NULL'
             WHEN 'total_iva'             THEN 'NULL'
             WHEN 'total_final'           THEN 'NULL'
             WHEN 'tipo_fecho'            THEN 'NULL'
             WHEN 'km_entrada'            THEN 'NULL'
             WHEN 'combustivel_entrada'   THEN 'NULL'
             WHEN 'eletricidade_entrada'  THEN 'NULL'
             WHEN 'dua_devolvida_em'      THEN 'NULL'
             WHEN 'entrega_via_any_rent'  THEN 'false'
             WHEN 'created_by'            THEN '$5'
             WHEN 'updated_by'            THEN '$5'
             WHEN 'created_at'            THEN 'now()'
             WHEN 'updated_at'            THEN 'now()'
             ELSE quote_ident(c.column_name)
           END, ', ' ORDER BY c.ordinal_position)
    INTO v_cols, v_vals
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name   = 'contratos_renting'
     AND c.is_generated = 'NEVER'
     AND c.column_name <> 'id';

  EXECUTE format(
    'INSERT INTO public.contratos_renting (%s) SELECT %s FROM public.contratos_renting WHERE id = $1 RETURNING id',
    v_cols, v_vals
  )
  INTO v_new_id
  USING v_old.id, v_old.versao + 1,
        format('Preço semanal negociado: %s € a partir de %s',
               p_preco, to_char(v_desde AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY')),
        v_desde, COALESCE(v_user, v_old.created_by), p_preco;

  INSERT INTO public.contrato_condutores (org_id, contrato_id, cliente_id, motorista_id, is_principal)
  SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
    FROM public.contrato_condutores WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_coberturas (org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor)
  SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    FROM public.contrato_coberturas WHERE contrato_id = v_old.id;

  -- O km excedente é do período que fechou — fica na versão que sai.
  INSERT INTO public.contrato_extras (org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total)
  SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    FROM public.contrato_extras
   WHERE contrato_id = v_old.id
     AND extra_nome NOT LIKE 'Km excedente%';

  INSERT INTO public.contrato_taxas (org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado)
  SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    FROM public.contrato_taxas WHERE contrato_id = v_old.id;

  -- Não há entrega física: a viatura não saiu do motorista.
  DELETE FROM public.calendario_eventos
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = v_new_id
     AND tipo IN ('entrega', 'recolha')
     AND realizado_em IS NULL;

  INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
  VALUES
    (v_old.id, v_old.org_id, 'alteracao', v_user,
     format('Preço semanal renegociado para %s € a partir de %s. Continua na versão %s.',
            p_preco, to_char(v_desde AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY'), v_old.versao + 1)),
    (v_new_id, v_old.org_id, 'alteracao', v_user,
     format('Preço semanal negociado: %s € (pedido %s). Antes: %s.',
            p_preco, p_pedido_id,
            COALESCE(v_old.preco_semana_acordado::text || ' €', 'tarifa')));

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_aplicar_preco_semana_negociado(uuid, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aplicar_preco_semana_negociado(uuid, numeric, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
