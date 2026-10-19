-- ============================================================
-- Preço semanal negociado num contrato TVDE, com aprovação
-- ============================================================
-- O condutor TVDE pagava sempre o preço da tabela (tarifa × modelo). Quando o
-- gestor negociava outro valor, só o conseguia aplicar mudando a tarifa — que
-- serve a frota inteira. Passa a haver um preço por contrato, pedido pelo
-- gestor e aprovado pelo Supervisor Gestor TVDE, no mesmo fluxo dos kms.
--
--   * contratos_renting.preco_semana_acordado: NULL segue a tarifa; preenchido
--     é o preço do condutor. Só o escreve a aprovação do pedido. A renovação e
--     a troca de viatura copiam todas as colunas, por isso a versão nova herda-o.
--   * pedidos_alteracao_contrato.tipo ganha 'preco_semana'. Aprovado, escreve
--     também valor_total_manual (o que se factura ao cliente), que num TVDE é o
--     preço semanal — a mesma regra do formulário ao escolher a tarifa.
--   * Conta a partir da semana em curso (a primeira por fechar): o aceite abre
--     uma versão nova do contrato nessa segunda-feira, e as semanas anteriores
--     ficam na versão antiga, com o preço antigo.
-- ============================================================

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS preco_semana_acordado numeric(12, 2);

ALTER TABLE public.contratos_renting
  DROP CONSTRAINT IF EXISTS contratos_renting_preco_semana_acordado_check;
ALTER TABLE public.contratos_renting
  ADD CONSTRAINT contratos_renting_preco_semana_acordado_check
  CHECK (preco_semana_acordado IS NULL OR preco_semana_acordado >= 0);

COMMENT ON COLUMN public.contratos_renting.preco_semana_acordado IS
  'Preço semanal do condutor negociado para este contrato TVDE, aprovado pelo '
  'Supervisor Gestor TVDE (pedidos_alteracao_contrato tipo=''preco_semana''). '
  'NULL = segue a tarifa do modelo. Ganha sempre à tarifa no fecho semanal e '
  'no resumo. 0 é um preço válido; quem lê distingue NULL de 0.';

ALTER TABLE public.pedidos_alteracao_contrato
  DROP CONSTRAINT IF EXISTS pedidos_alteracao_contrato_tipo_check;
ALTER TABLE public.pedidos_alteracao_contrato
  ADD CONSTRAINT pedidos_alteracao_contrato_tipo_check
  CHECK (tipo = ANY (ARRAY['kms', 'franquia', 'tarifa', 'preco_semana']));

COMMENT ON TABLE public.pedidos_alteracao_contrato IS
  'Pedido de excepção de kms/franquia/tarifa/preço semanal para um contrato '
  'específico, fora do valor sugerido pela tarifa do grupo. Só produz efeito no '
  'contrato depois de aceite pelo Supervisor Gestor TVDE. '
  'km_adicional_valor_atual/pedido só usados quando tipo=''kms''.';

-- ------------------------------------------------------------
-- Notificação: texto do tipo novo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar_pedido_troca_kms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_codigo integer;
  v_titulo text;
  v_mensagem text;
BEGIN
  SELECT codigo INTO v_codigo FROM public.contratos_renting WHERE id = NEW.contrato_id;

  v_titulo := CASE NEW.tipo
    WHEN 'franquia'     THEN format('Pedido de alteração de franquia — contrato #%s', COALESCE(v_codigo::text, '?'))
    WHEN 'tarifa'       THEN format('Pedido de alteração de tarifa — contrato #%s', COALESCE(v_codigo::text, '?'))
    WHEN 'preco_semana' THEN format('Pedido de alteração do preço semanal — contrato #%s', COALESCE(v_codigo::text, '?'))
    ELSE format('Pedido de alteração de kms — contrato #%s', COALESCE(v_codigo::text, '?'))
  END;

  v_mensagem := CASE NEW.tipo
    WHEN 'franquia'     THEN format('Franquia: %s € → %s €. Motivo: %s', NEW.valor_atual, NEW.valor_pedido, NEW.motivo)
    WHEN 'tarifa'       THEN format('Tarifa diária: %s € → %s €. Motivo: %s', NEW.valor_atual, NEW.valor_pedido, NEW.motivo)
    WHEN 'preco_semana' THEN format('Preço semanal: %s € → %s €. Motivo: %s', NEW.valor_atual, NEW.valor_pedido, NEW.motivo)
    ELSE format('Kms incluídos: %s → %s. Motivo: %s', NEW.valor_atual, NEW.valor_pedido, NEW.motivo)
  END;

  INSERT INTO public.notificacoes (org_id, tipo, titulo, mensagem, severidade)
  VALUES (NEW.org_id, 'pedido_troca_kms', v_titulo, v_mensagem, 'normal');

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- Versão substituída não muda de preço
-- ------------------------------------------------------------
-- Igual à anterior (20260922120000), mais preco_semana_acordado: é o preço das
-- semanas que essa versão cobriu.
CREATE OR REPLACE FUNCTION public.fn_contratos_renting_versao_imutavel()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.substituido_em IS NOT NULL THEN
    -- Permite só alterar deleted_at (soft-delete administrativo),
    -- estado_financeiro (anular/refaturar o período desta versão) e
    -- updated_at/updated_by (refrescados por triggers internos).
    IF (NEW.tarifa_diaria          IS DISTINCT FROM OLD.tarifa_diaria)
       OR (NEW.desconto_percentagem IS DISTINCT FROM OLD.desconto_percentagem)
       OR (NEW.taxa_iva             IS DISTINCT FROM OLD.taxa_iva)
       OR (NEW.valor_total_manual   IS DISTINCT FROM OLD.valor_total_manual)
       OR (NEW.preco_semana_acordado IS DISTINCT FROM OLD.preco_semana_acordado)
       OR (NEW.franquia_valor       IS DISTINCT FROM OLD.franquia_valor)
       OR (NEW.caucao_valor         IS DISTINCT FROM OLD.caucao_valor)
       OR (NEW.kms_incluidos        IS DISTINCT FROM OLD.kms_incluidos)
       OR (NEW.km_adicional_valor   IS DISTINCT FROM OLD.km_adicional_valor)
       OR (NEW.estado_operacional   IS DISTINCT FROM OLD.estado_operacional)
       OR (NEW.viatura_id           IS DISTINCT FROM OLD.viatura_id)
       OR (NEW.cliente_id           IS DISTINCT FROM OLD.cliente_id)
       OR (NEW.emissor_id           IS DISTINCT FROM OLD.emissor_id)
       OR (NEW.data_inicio          IS DISTINCT FROM OLD.data_inicio)
       OR (NEW.data_fim             IS DISTINCT FROM OLD.data_fim)
       OR (NEW.regime               IS DISTINCT FROM OLD.regime)
       OR (NEW.transferista_id      IS DISTINCT FROM OLD.transferista_id)
       OR (NEW.motivo_versao        IS DISTINCT FROM OLD.motivo_versao)
       OR (NEW.versao               IS DISTINCT FROM OLD.versao)
       OR (NEW.contrato_anterior_id IS DISTINCT FROM OLD.contrato_anterior_id)
    THEN
      RAISE EXCEPTION
        'Versão substituída de contrato é imutável. Cria uma nova versão se queres editar.'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- Aplicar o preço: versão nova a partir da segunda-feira desta semana
-- ------------------------------------------------------------
-- O resumo do motorista recalcula as semanas fechadas a partir do contrato (e
-- regrava motorista_liquido_semanal). Mudar o preço no próprio contrato
-- reescrevia semanas já fechadas. Por isso o preço novo nasce numa versão que
-- começa na segunda-feira da semana em curso — a primeira ainda por fechar —
-- e a versão anterior fica com o preço antigo, como na renovação.
-- Um contrato que já começou nesta semana muda no próprio sítio.
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
BEGIN
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

  IF v_old.data_inicio >= v_desde THEN
    UPDATE public.contratos_renting
       SET preco_semana_acordado = p_preco,
           valor_total_manual    = p_preco,
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
             WHEN 'valor_total_manual'    THEN '$6'
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

-- ------------------------------------------------------------
-- Responder ao pedido: aplica o preço semanal na versão em vigor
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.responder_pedido_troca_kms(
  p_pedido_id uuid,
  p_aceite boolean,
  p_resposta_motivo text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido   public.pedidos_alteracao_contrato%ROWTYPE;
  v_contrato public.contratos_renting%ROWTYPE;
  v_seguinte uuid;
BEGIN
  IF NOT (
    public.is_current_user_admin()
    OR public.current_user_tem_cargo(array['Supervisor Gestor TVDE'])
  ) THEN
    RAISE EXCEPTION 'Só o Supervisor Gestor TVDE pode responder a este pedido.';
  END IF;

  SELECT * INTO v_pedido
    FROM public.pedidos_alteracao_contrato
   WHERE id = p_pedido_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF v_pedido.org_id <> public.get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este pedido.';
  END IF;

  IF v_pedido.estado <> 'pendente' THEN
    RAISE EXCEPTION 'Este pedido já foi respondido.';
  END IF;

  UPDATE public.pedidos_alteracao_contrato
     SET estado           = CASE WHEN p_aceite THEN 'aceite' ELSE 'recusado' END,
         resposta_motivo   = p_resposta_motivo,
         respondido_por    = auth.uid(),
         respondido_em     = now()
   WHERE id = p_pedido_id;

  IF p_aceite THEN
    IF v_pedido.tipo = 'kms' THEN
      UPDATE public.contratos_renting
         SET kms_incluidos      = v_pedido.valor_pedido,
             km_adicional_valor = COALESCE(v_pedido.km_adicional_valor_pedido, km_adicional_valor),
             updated_by         = auth.uid()
       WHERE id = v_pedido.contrato_id;
    ELSIF v_pedido.tipo = 'franquia' THEN
      UPDATE public.contratos_renting
         SET franquia_valor = v_pedido.valor_pedido,
             updated_by     = auth.uid()
       WHERE id = v_pedido.contrato_id;
    ELSIF v_pedido.tipo = 'tarifa' THEN
      UPDATE public.contratos_renting
         SET tarifa_diaria = v_pedido.valor_pedido,
             updated_by    = auth.uid()
       WHERE id = v_pedido.contrato_id;
    ELSIF v_pedido.tipo = 'preco_semana' THEN
      -- O TVDE renova numa versão nova; um pedido feito antes da renovação
      -- aplica-se à versão em vigor, não à que já fechou (essa é imutável).
      SELECT * INTO v_contrato
        FROM public.contratos_renting
       WHERE id = v_pedido.contrato_id AND org_id = v_pedido.org_id;
      LOOP
        EXIT WHEN NOT FOUND OR v_contrato.substituido_em IS NULL;
        SELECT id INTO v_seguinte
          FROM public.contratos_renting
         WHERE contrato_anterior_id = v_contrato.id AND org_id = v_pedido.org_id
           AND deleted_at IS NULL
         ORDER BY versao DESC
         LIMIT 1;
        EXIT WHEN v_seguinte IS NULL;
        SELECT * INTO v_contrato FROM public.contratos_renting WHERE id = v_seguinte;
        v_seguinte := NULL;
      END LOOP;

      PERFORM public.fn_aplicar_preco_semana_negociado(
        v_contrato.id, v_pedido.valor_pedido, p_pedido_id);
    END IF;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.responder_pedido_troca_kms(uuid, boolean, text) IS
  'Supervisor Gestor TVDE aceita ou recusa um pedido de excepção de kms/'
  'franquia/tarifa/preço semanal. Se aceite, aplica o valor pedido no campo '
  'correspondente do contrato. O preço semanal vai para a versão em vigor e '
  'escreve preco_semana_acordado e valor_total_manual.';

-- ------------------------------------------------------------
-- Extrato do painel do motorista: o negociado antes da estimativa
-- ------------------------------------------------------------
-- Igual a 20260917120000, menos a CTE renda_tarifa, que estimava sempre pela
-- tabela do modelo. Só serve quando ainda não há renda lançada.
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
  -- Preço negociado do contrato TVDE em curso ganha à estimativa pela tabela.
  renda_tarifa AS (
    SELECT COALESCE((
      SELECT c.preco_semana_acordado FROM contratos_renting c
      JOIN contrato_condutores cc ON cc.contrato_id = c.id
      WHERE cc.motorista_id = (SELECT mid FROM j) AND c.regime = 'tvde'
        AND c.deleted_at IS NULL AND c.substituido_em IS NULL
        AND c.estado_operacional = 'em_curso' AND c.preco_semana_acordado IS NOT NULL
      ORDER BY c.data_inicio DESC LIMIT 1), (
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

NOTIFY pgrst, 'reload schema';
