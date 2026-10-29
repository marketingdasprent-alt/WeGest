-- Km extra cobrados pelo canal do regime, em qualquer fecho e na renovação.
--
-- 20261028100000 cobrava no fecho só pelo ecrã de fecho e lançava sempre linha
-- no contrato + débito ao motorista. Em produção (28-10): nenhum TVDE se fatura
-- pelo contrato — cobra-se na conta-corrente —, e o rent-a-car cobra-se na
-- fatura do contrato. Extra + débito cobrava duas vezes um, e as renovações
-- TVDE (linha nos extras) nunca chegaram ao motorista. Ficava ainda de fora a
-- recolha confirmada por QR, e reverter o fecho deixava a cobrança lançada.
--
-- Agora: rent-a-car → linha nos extras; TVDE → débito na conta-corrente. No
-- fecho é um trigger que acompanha o estado (fechar, corrigir o km, reverter),
-- seja qual for o caminho. Só daqui para a frente: o que fechou antes fica.

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS cobrar_km_excedente boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS km_excedente_avaliado_em timestamptz;

COMMENT ON COLUMN public.contratos_renting.cobrar_km_excedente IS
  'false quando o gestor perdoa os km extra do fecho.';
COMMENT ON COLUMN public.contratos_renting.km_excedente_avaliado_em IS
  'Quando o fecho avaliou os km extra. NULL num contrato fechado = fechou antes desta regra; não se cobra.';


-- A conta, sem efeitos. Km de saída 0 é "não registado": o #25 da Premium Ride
-- cobrou na renovação o conta-quilómetros inteiro (112 408 km) por causa disso.
CREATE OR REPLACE FUNCTION public.km_excedente_calcular(
  p_c public.contratos_renting,
  p_km_inicio integer,
  p_km_fim integer
) RETURNS TABLE (km_percorridos integer, km_excedente integer, valor numeric)
    LANGUAGE sql
    IMMUTABLE
    AS $$
  SELECT p_km_fim - p_km_inicio,
         CASE WHEN ok THEN p_km_fim - p_km_inicio - p_c.kms_incluidos ELSE 0 END,
         CASE WHEN ok THEN round((p_km_fim - p_km_inicio - p_c.kms_incluidos) * p_c.km_adicional_valor, 2) ELSE 0 END
    FROM (SELECT p_km_inicio > 0
                 AND p_km_fim IS NOT NULL
                 AND p_c.kms_incluidos IS NOT NULL
                 AND COALESCE(p_c.km_adicional_valor, 0) > 0
                 AND p_km_fim - p_km_inicio > p_c.kms_incluidos AS ok) t;
$$;

REVOKE ALL ON FUNCTION public.km_excedente_calcular(public.contratos_renting, integer, integer) FROM PUBLIC, anon, authenticated;


-- Lança os km extra pelo canal do regime. Interna: só o trigger do fecho e a
-- renovação a chamam. TVDE sem motorista cai na linha do contrato, para não se perder.
CREATE OR REPLACE FUNCTION public.km_excedente_cobrar(
  p_c public.contratos_renting,
  p_km_inicio integer,
  p_km_fim integer,
  p_momento text
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_calc      record;
  v_detalhe   text;
  v_motorista uuid;
  v_extra_id  uuid;
BEGIN
  IF p_momento NOT IN ('fecho', 'renovacao') THEN
    RAISE EXCEPTION 'Momento de km extra inesperado: %.', p_momento;
  END IF;

  SELECT * INTO v_calc FROM public.km_excedente_calcular(p_c, p_km_inicio, p_km_fim);
  IF v_calc.valor <= 0 THEN
    RETURN jsonb_build_object('km_excedente', 0, 'valor', 0, 'canal', null);
  END IF;

  v_detalhe := v_calc.km_excedente || ' km × '
    || rtrim(rtrim(to_char(p_c.km_adicional_valor, 'FM999990.0000'), '0'), '.') || ' €';

  IF p_c.regime = 'tvde' THEN
    SELECT cc.motorista_id INTO v_motorista
      FROM public.contrato_condutores cc
     WHERE cc.contrato_id = p_c.id
       AND cc.motorista_id IS NOT NULL
     ORDER BY cc.is_principal DESC NULLS LAST, (cc.data_fim IS NULL) DESC, cc.data_inicio DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF v_motorista IS NOT NULL THEN
    INSERT INTO public.motorista_financeiro (
      org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, referencia, criado_por
    ) VALUES (
      p_c.org_id, v_motorista, 'debito', 'outro',
      CASE p_momento WHEN 'fecho' THEN 'Km extra no fecho' ELSE 'Km extra na renovação' END
        || ' do contrato #' || p_c.codigo || ' (' || v_detalhe || ')',
      v_calc.valor, (now() AT TIME ZONE 'Europe/Lisbon')::date, 'pendente',
      'km_excedente_' || p_momento || ':' || p_c.id, auth.uid()
    );
    RETURN jsonb_build_object('km_excedente', v_calc.km_excedente, 'valor', v_calc.valor, 'canal', 'conta_corrente');
  END IF;

  SELECT id INTO v_extra_id
    FROM public.renting_extras
   WHERE org_id = p_c.org_id AND nome = 'Km excedente'
   LIMIT 1;

  -- Inactivo ao nascer: os extras activos aparecem no catálogo da API pública.
  IF v_extra_id IS NULL THEN
    INSERT INTO public.renting_extras (org_id, nome, descricao, preco_unidade, tipo_calculo, ativo, created_by)
    VALUES (p_c.org_id, 'Km excedente', 'Km acima do limite incluído — gerado automaticamente.',
            0, 'fixo', false, auth.uid())
    RETURNING id INTO v_extra_id;
  END IF;

  -- Quantidade 1 com o total no preço: preco_unidade tem 2 casas e o €/km pode ter 4.
  INSERT INTO public.contrato_extras (
    org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total, created_by
  ) VALUES (
    p_c.org_id, p_c.id, v_extra_id,
    CASE p_momento WHEN 'fecho' THEN 'Km excedente no fecho' ELSE 'Km excedente' END || ' (' || v_detalhe || ')',
    v_calc.valor, 'fixo', 1, v_calc.valor, auth.uid()
  );
  RETURN jsonb_build_object('km_excedente', v_calc.km_excedente, 'valor', v_calc.valor, 'canal', 'extra');
END;
$$;

REVOKE ALL ON FUNCTION public.km_excedente_cobrar(public.contratos_renting, integer, integer, text) FROM PUBLIC, anon, authenticated;


-- O fecho acompanha o estado do contrato: ao fechar cobra, ao corrigir o km
-- recalcula, ao reverter retira. BEFORE para gravar km_excedente_avaliado_em na
-- mesma linha; o cálculo usa NEW, não a linha ainda por gravar.
CREATE OR REPLACE FUNCTION public.fn_km_excedente_no_fecho()
RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ref text := 'km_excedente_fecho:' || NEW.id;
BEGIN
  -- Fechou antes desta regra: o passado fica como está.
  IF OLD.estado_operacional = 'fechado' AND NEW.estado_operacional = 'fechado'
     AND OLD.km_excedente_avaliado_em IS NULL THEN
    RETURN NEW;
  END IF;

  -- O que já foi cobrado não se mexe: débito pago, ou linha que pode já estar
  -- numa fatura (contrato faturado depois de a linha existir).
  IF EXISTS (SELECT 1 FROM public.motorista_financeiro
              WHERE referencia = v_ref AND status IS DISTINCT FROM 'pendente')
     OR (OLD.estado_financeiro IS DISTINCT FROM 'pendente'
         AND EXISTS (SELECT 1 FROM public.contrato_extras
                      WHERE contrato_id = NEW.id AND extra_nome LIKE 'Km excedente no fecho%')) THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.contrato_extras
   WHERE contrato_id = NEW.id AND extra_nome LIKE 'Km excedente no fecho%';
  DELETE FROM public.motorista_financeiro WHERE referencia = v_ref;

  IF NEW.estado_operacional = 'fechado' THEN
    IF NEW.cobrar_km_excedente THEN
      PERFORM public.km_excedente_cobrar(NEW, NEW.km_saida, NEW.km_entrada, 'fecho');
    END IF;
    NEW.km_excedente_avaliado_em := now();
  ELSE
    NEW.km_excedente_avaliado_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_km_excedente_no_fecho() FROM PUBLIC, anon, authenticated;

-- Versões substituídas ficam de fora: a renovação cobra o seu ciclo, e a troca
-- fecha a versão antiga antes de a substituir. "zz" para correr depois dos
-- outros BEFORE, que ainda mexem na linha.
DROP TRIGGER IF EXISTS trg_zz_km_excedente_no_fecho ON public.contratos_renting;
CREATE TRIGGER trg_zz_km_excedente_no_fecho
  BEFORE UPDATE OF estado_operacional, km_saida, km_entrada, kms_incluidos, km_adicional_valor, cobrar_km_excedente
  ON public.contratos_renting
  FOR EACH ROW
  WHEN (NEW.substituido_em IS NULL
        AND (OLD.estado_operacional = 'fechado' OR NEW.estado_operacional = 'fechado'))
  EXECUTE FUNCTION public.fn_km_excedente_no_fecho();

-- Renovação e troca criam a versão nova copiando todas as colunas da antiga:
-- sem isto herdava o "não cobrar" e a avaliação do fecho anterior.
CREATE OR REPLACE FUNCTION public.fn_km_excedente_contrato_novo()
RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.cobrar_km_excedente := true;
  NEW.km_excedente_avaliado_em := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_km_excedente_contrato_novo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_km_excedente_contrato_novo ON public.contratos_renting;
CREATE TRIGGER trg_km_excedente_contrato_novo
  BEFORE INSERT ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.fn_km_excedente_contrato_novo();


-- Escolha do gestor no ecrã de fecho ("cobrar km extra") + pré-visualização.
-- Já não lança nada: quem lança é o trigger ao fechar. Num contrato já fechado,
-- mudar a escolha recalcula na hora. Devolve valor_previsto, não valor: o
-- frontend de 20261028100000 debitava ao motorista quando via `valor`.
CREATE OR REPLACE FUNCTION public.lancar_km_excedente_fecho(
  p_contrato_id uuid,
  p_cobrar boolean DEFAULT true
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_c    public.contratos_renting%ROWTYPE;
  v_calc record;
BEGIN
  SELECT * INTO v_c FROM public.contratos_renting WHERE id = p_contrato_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', p_contrato_id;
  END IF;
  -- IS DISTINCT FROM: sem org activa get_current_org_id() é NULL e "<>" deixava passar.
  IF v_c.org_id IS DISTINCT FROM get_current_org_id() OR NOT has_renting_contratos_access() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.' USING ERRCODE = '42501';
  END IF;
  IF v_c.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato foi eliminado.';
  END IF;

  IF v_c.cobrar_km_excedente IS DISTINCT FROM p_cobrar THEN
    UPDATE public.contratos_renting SET cobrar_km_excedente = p_cobrar WHERE id = v_c.id;
  END IF;

  SELECT * INTO v_calc FROM public.km_excedente_calcular(v_c, v_c.km_saida, v_c.km_entrada);
  RETURN jsonb_build_object(
    'km_percorridos', v_calc.km_percorridos,
    'km_excedente', v_calc.km_excedente,
    'valor_previsto', CASE WHEN p_cobrar THEN v_calc.valor ELSE 0 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lancar_km_excedente_fecho(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lancar_km_excedente_fecho(uuid, boolean) TO authenticated;


-- Renovação: mesma função, mesmo canal. Corpo igual ao de 20260924180000
-- (confirmado igual ao de produção a 28-10) excepto o bloco do km excedente.
CREATE OR REPLACE FUNCTION public.renovar_contrato_renting(
  p_contrato_id uuid,
  p_km_inicio integer DEFAULT NULL,
  p_km_fim integer DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old            public.contratos_renting%ROWTYPE;
  v_user_id        uuid := auth.uid();
  v_new_id         uuid;
  v_inicio         timestamptz;
  v_fim            timestamptz;
  v_ancora         timestamptz;
  v_hoje           date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_semana         timestamptz;
  v_legado         boolean;
  v_conflito       integer;
  v_cols           text;
  v_vals           text;
BEGIN
  SELECT * INTO v_old FROM public.contratos_renting WHERE id = p_contrato_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', p_contrato_id;
  END IF;
  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato foi eliminado.';
  END IF;
  IF v_old.substituido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato já foi renovado/substituído. Renova a versão actual.';
  END IF;
  -- IS DISTINCT FROM, não <>: sem org activa get_current_org_id() é NULL, e
  -- "x <> NULL" não dispara o IF — deixava renovar contratos de outra org.
  IF v_old.org_id IS DISTINCT FROM get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;
  IF NOT COALESCE(v_old.is_longa_duracao, false) THEN
    RAISE EXCEPTION 'A renovação só se aplica a contratos de longa duração.';
  END IF;

  IF v_old.estado_operacional <> 'em_curso' THEN
    RAISE EXCEPTION
      'Só é possível renovar um contrato em curso (estado actual: %). Confirma a entrega/abertura do contrato antes de renovar.',
      v_old.estado_operacional;
  END IF;

  IF v_old.data_fim IS NULL AND v_old.regime <> 'tvde' THEN
    RAISE EXCEPTION 'Contrato sem data de fim — não é possível calcular o novo período.';
  END IF;
  IF p_km_inicio IS NOT NULL AND p_km_fim IS NOT NULL AND p_km_fim < p_km_inicio THEN
    RAISE EXCEPTION 'O km final (%) não pode ser inferior ao km inicial (%).', p_km_fim, p_km_inicio;
  END IF;

  -- TVDE: o prazo que se renova e a janela, antes de qualquer efeito — um
  -- clique repetido não pode deixar km nem excedente lançados.
  IF v_old.regime = 'tvde' THEN
    v_ancora := COALESCE(
      v_old.proxima_renovacao_em,
      public.proxima_data_renovacao(v_old.data_inicio, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias)
    );

    IF (v_ancora AT TIME ZONE 'Europe/Lisbon')::date > v_hoje + 7 THEN
      RAISE EXCEPTION
        'O contrato #% só renova a % — pode renovar-se a partir de % (7 dias antes).',
        v_old.codigo,
        to_char(v_ancora AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY'),
        to_char((v_ancora AT TIME ZONE 'Europe/Lisbon')::date - 7, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── Comum aos dois caminhos ────────────────────────────────────────────
  IF p_km_fim IS NOT NULL AND v_old.viatura_id IS NOT NULL THEN
    UPDATE public.viaturas
       SET km_atual = p_km_fim
     WHERE id = v_old.viatura_id
       AND (km_atual IS NULL OR p_km_fim >= km_atual);
  END IF;

  -- Km excedente do ciclo que fecha: rent-a-car nos extras, TVDE na conta-corrente.
  PERFORM public.km_excedente_cobrar(v_old, p_km_inicio, p_km_fim, 'renovacao');

  -- ── TVDE: cada renovação fecha o período numa versão ───────────────────
  -- A versão que sai é o contrato daquele período (datas, valores, km) — é
  -- ela que se abre e imprime quando o motorista pede o contrato do mês
  -- passado. A nova continua sem data de fim: nada expira se não se renovar,
  -- que era o problema das versões de 30 dias antes de 20260908093000.
  IF v_old.regime = 'tvde' THEN
    -- Do prazo, no ciclo escolhido; atrasado salta para a ocorrência depois de hoje.
    v_fim := public.proxima_renovacao_no_ciclo(
               v_ancora, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias,
               GREATEST(now(), v_ancora));
    v_semana := date_trunc('week', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon';
    v_legado := v_old.data_fim IS NOT NULL AND v_old.data_fim < v_semana;

    -- A viatura tem de estar livre a partir de agora — senão a trava de
    -- overbooking rebentava com um erro cru.
    SELECT o.codigo INTO v_conflito
      FROM public.contratos_renting o
     WHERE o.org_id = v_old.org_id
       AND o.viatura_id = v_old.viatura_id
       AND o.id <> v_old.id
       AND o.deleted_at IS NULL
       AND o.substituido_em IS NULL
       AND o.estado_operacional IN ('agendado', 'em_curso')
       AND o.periodo && tstzrange(now(), NULL)
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'A viatura do contrato #% já está no contrato #%. Não se renova por cima: fecha este contrato ou resolve o outro primeiro.',
        v_old.codigo, v_conflito
        USING ERRCODE = 'check_violation';
    END IF;

    v_inicio := now();

    -- O período fecha agora e a versão nova começa no mesmo instante: sem
    -- buraco nem sobreposição no aluguer. Num legado cuja data_fim já fechou
    -- semanas, fica essa data — é ela que diz até onde já se cobrou.
    UPDATE public.contratos_renting
       SET substituido_em     = now(),
           estado_operacional = 'fechado'::contrato_estado_operacional_enum,
           data_fim           = CASE WHEN v_legado THEN data_fim ELSE v_inicio END,
           km_entrada         = COALESCE(p_km_fim, km_entrada),
           updated_by         = v_user_id
     WHERE id = v_old.id;

    -- Cópia de todas as colunas, como em criar_versao_contrato_renting: uma
    -- coluna nova na tabela não se perde na renovação. O código mantém-se.
    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position),
           string_agg(
             CASE c.column_name
               WHEN 'versao'               THEN '$2'
               WHEN 'contrato_anterior_id' THEN '$1'
               WHEN 'motivo_versao'        THEN '$3'
               WHEN 'substituido_em'       THEN 'NULL'
               WHEN 'deleted_at'           THEN 'NULL'
               WHEN 'data_inicio'          THEN '$4'
               WHEN 'data_fim'             THEN 'NULL'
               WHEN 'proxima_renovacao_em' THEN '$6'
               WHEN 'estado_operacional'   THEN '''em_curso''::contrato_estado_operacional_enum'
               WHEN 'estado_financeiro'    THEN '''pendente''::contrato_estado_financeiro_enum'
               WHEN 'facturado_em'         THEN 'NULL'
               WHEN 'total_subtotal'       THEN 'NULL'
               WHEN 'total_iva'            THEN 'NULL'
               WHEN 'total_final'          THEN 'NULL'
               WHEN 'tipo_fecho'           THEN 'NULL'
               WHEN 'km_saida'             THEN 'COALESCE($7, km_saida)'
               WHEN 'km_entrada'           THEN 'NULL'
               WHEN 'combustivel_entrada'  THEN 'NULL'
               WHEN 'eletricidade_entrada' THEN 'NULL'
               WHEN 'dua_devolvida_em'     THEN 'NULL'
               WHEN 'entrega_via_any_rent' THEN 'false'
               WHEN 'created_by'           THEN '$5'
               WHEN 'updated_by'           THEN '$5'
               WHEN 'created_at'           THEN 'now()'
               WHEN 'updated_at'           THEN 'now()'
               ELSE quote_ident(c.column_name)
             END, ', ' ORDER BY c.ordinal_position)
      INTO v_cols, v_vals
      FROM information_schema.columns c
     WHERE c.table_schema  = 'public'
       AND c.table_name    = 'contratos_renting'
       AND c.is_generated  = 'NEVER'
       AND c.column_name  <> 'id';

    EXECUTE format(
      'INSERT INTO public.contratos_renting (%s) SELECT %s FROM public.contratos_renting WHERE id = $1 RETURNING id',
      v_cols, v_vals
    )
    INTO v_new_id
    USING v_old.id, v_old.versao + 1,
          CASE WHEN v_legado
            THEN 'Renovação — reaberto a ' || to_char(v_inicio AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
                 '; tinha terminado a ' || to_char(v_old.data_fim AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
                 ' (sem aluguer no intervalo)'
            ELSE 'Renovação — ciclo de ' || to_char(v_ancora AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
                 ' renovado a ' || to_char(v_inicio AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
                 '; próxima renovação a ' || to_char(v_fim AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY')
          END,
          v_inicio, v_user_id, v_fim, p_km_fim;

    INSERT INTO public.contrato_condutores (org_id, contrato_id, cliente_id, motorista_id, is_principal)
    SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
      FROM public.contrato_condutores WHERE contrato_id = v_old.id;

    INSERT INTO public.contrato_coberturas (org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor)
    SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
      FROM public.contrato_coberturas WHERE contrato_id = v_old.id;

    -- O km excedente é do ciclo que fechou — fica na versão que sai. Copiá-lo
    -- cobrava-o outra vez.
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

    -- Sem o prefixo "Renovado em …": esse é o das renovações de 08-09 a 24-09,
    -- sem versão, que o separador Histórico lista à parte.
    INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
    VALUES
      (v_old.id, v_old.org_id, 'alteracao', v_user_id,
       'Renovação: período fechado a ' || to_char(now() AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') ||
       CASE WHEN v_legado
            THEN ' (tinha terminado a ' || to_char(v_old.data_fim AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
                 '; as semanas do intervalo ficam sem aluguer)'
            ELSE '' END ||
       '. Continua na versão ' || (v_old.versao + 1) || '.'),
      (v_new_id, v_old.org_id, 'alteracao', v_user_id,
       'Renovação da versão ' || v_old.versao || '. Próxima renovação a ' ||
       to_char(v_fim AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') || '.');

    RETURN v_new_id;
  END IF;

  -- ── Rent-a-car: a versão é a unidade de facturação, versiona como sempre ─
  v_inicio := COALESCE(v_old.data_fim, now());
  v_fim    := public.proxima_data_renovacao(
                v_inicio, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias);

  UPDATE public.contratos_renting
     SET substituido_em     = now(),
         estado_operacional = 'fechado'::contrato_estado_operacional_enum,
         updated_by         = v_user_id,
         km_saida           = COALESCE(p_km_inicio, km_saida),
         km_entrada         = COALESCE(p_km_fim, km_entrada)
   WHERE id = v_old.id;

  INSERT INTO public.contratos_renting (
    org_id, reserva_id, transferista_id, cliente_id, emissor_id, gestor_id,
    viatura_id, matricula, grupo,
    estacao_entrega_id, data_inicio, estacao_recolha_id, data_fim, estacao_origem_viatura_id,
    estado_operacional, estado_financeiro, origem, regime,
    tarifa_diaria, tarifa_id, desconto_percentagem, taxa_iva, valor_total_manual,
    is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias,
    franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
    km_saida,
    dua_original_com_motorista, dua_observacoes,
    voucher_codigo, numero_processo, voo_referencia,
    local_entrega, local_recolha, comentarios_entrega, comentarios_recolha,
    observacoes, observacoes_internas,
    versao, contrato_anterior_id, motivo_versao,
    created_by
  )
  VALUES (
    v_old.org_id, v_old.reserva_id, v_old.transferista_id, v_old.cliente_id, v_old.emissor_id, v_old.gestor_id,
    v_old.viatura_id, v_old.matricula, v_old.grupo,
    v_old.estacao_entrega_id, v_inicio, v_old.estacao_recolha_id, v_fim, v_old.estacao_origem_viatura_id,
    'em_curso'::contrato_estado_operacional_enum,
    'pendente', v_old.origem, v_old.regime,
    v_old.tarifa_diaria, v_old.tarifa_id, v_old.desconto_percentagem, v_old.taxa_iva, v_old.valor_total_manual,
    v_old.is_longa_duracao, v_old.renovacao_opcao, v_old.renovacao_intervalo_dias,
    v_old.franquia_valor, v_old.caucao_valor, v_old.kms_incluidos, v_old.km_adicional_valor,
    p_km_fim,
    v_old.dua_original_com_motorista, v_old.dua_observacoes,
    v_old.voucher_codigo, v_old.numero_processo, v_old.voo_referencia,
    v_old.local_entrega, v_old.local_recolha, v_old.comentarios_entrega, v_old.comentarios_recolha,
    v_old.observacoes, v_old.observacoes_internas,
    v_old.versao + 1, v_old.id,
    'Renovação — período de ' || to_char(v_inicio, 'YYYY-MM-DD') || ' a ' || to_char(v_fim, 'YYYY-MM-DD'),
    v_user_id
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.contrato_condutores (org_id, contrato_id, cliente_id, motorista_id, is_principal)
  SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
    FROM public.contrato_condutores WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_coberturas (org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor)
  SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    FROM public.contrato_coberturas WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_extras (org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total)
  SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    FROM public.contrato_extras WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_taxas (org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado)
  SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    FROM public.contrato_taxas WHERE contrato_id = v_old.id;

  DELETE FROM public.calendario_eventos
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = v_new_id
     AND tipo IN ('entrega', 'recolha')
     AND realizado_em IS NULL;

  RETURN v_new_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
