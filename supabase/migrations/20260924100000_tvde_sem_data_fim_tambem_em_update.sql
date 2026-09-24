-- Um contrato TVDE não tem data de fim — também depois de criado.
--
-- Decisão do utilizador (24-09-2026): TVDE não tem data_fim, só
-- proxima_renovacao_em. A 20260908092000 já o garantia na criação; faltava o
-- resto:
--
--   1. Limpar a data_fim de legado dos TVDE vivos — mas SÓ onde isso não cobra
--      semanas passadas (ver "Porque não se limpam todos").
--   2. A trigger passa a valer também em UPDATE: um TVDE vivo sem data_fim
--      nunca volta a ter uma. Quem escrever lá uma data (o formulário fazia-o,
--      "data_fim passa a ser a próxima renovação") vê-a ir para
--      proxima_renovacao_em. E apagar uma data_fim de legado de uma semana
--      já fechada deixa de passar (a data fica), porque cobrava o retroactivo.
--   3. renovar_contrato_renting, no ramo TVDE, limpa a data_fim de legado ao
--      renovar; e quando o legado já é de uma semana passada, reabre o contrato
--      numa versão nova a partir de HOJE, em vez de o limpar.
--
-- ── Porque não se limpam todos ───────────────────────────────────────────
-- O aluguer é calculado AO VIVO a partir de data_inicio/data_fim do contrato,
-- em todas as leituras: o resumo do motorista (periodosDoContrato →
-- slotPeriodos), Contas/Resumo, os recibos, e a edge function
-- fechar-semana-financeiro (reivindicarDiasPorContrato). data_fim a NULL quer
-- dizer "cobra de data_inicio+1 até ao fim da semana pedida". Num contrato
-- cuja data_fim de legado ficou para trás, limpá-la faz aparecer aluguer em
-- todas as semanas desde então — no ecrã imediatamente, e nos livros da
-- próxima vez que alguém refechar uma dessas semanas.
--
-- Daí a fronteira: segunda-feira 00:00 (Lisboa) da semana corrente.
--   · data_fim >= essa segunda: as semanas passadas já estavam cobertas pelo
--     contrato até ao fim; limpar só estende a semana corrente, que ainda não
--     fechou. Seguro. (Inclui o #821, que expira hoje, e o #842, amanhã.)
--   · data_fim < essa segunda: limpar = cobrança retroactiva. Ficam de fora e
--     vão para os gestores, um a um: se o motorista continua, Renovar reabre
--     o contrato a partir de hoje (versão nova, ver ponto 3); se já não está,
--     fecha-se. Vários parecem abandonados — o #441 e o #113 expiraram e a
--     viatura já está noutro contrato (#842, #875). Reabri-los em massa
--     passava a cobrar a quem talvez já não tenha o carro.
--
-- ── Sobreposições ────────────────────────────────────────────────────────
-- A trava contratos_no_overbooking é por viatura. Um contrato aberto até ao
-- infinito colide com qualquer contrato mais recente da mesma viatura. Regra:
-- de cada par, o mais antigo fica de fora, o mais recente é limpo. O filtro é
-- genérico (NOT EXISTS), não uma lista — em produção, a 24-09, as colisões de
-- viatura são #426↔#745, #441↔#842 e #113↔#875, e os três antigos já estão
-- fora por serem de semanas passadas. Dos mais recentes, o #842 e o #875 são
-- limpos; o #745 terminou a 06-09, antes desta semana, e fica pendente como
-- qualquer outro legado antigo (limpá-lo era retroactivo). #655↔#375 e #876↔#915 são viaturas diferentes — não partem
-- a trava e seguem a regra geral (o #876 é limpo; o #655 terminou a 08-09,
-- fica pendente).
--
-- gerar_cobrancas_tvde_semanais também lê data_fim, mas o cron está desligado
-- desde 20260715160000; se voltar a ser ligado, lê a mesma regra.

-- ── 1+2. A trigger: INSERT como antes, UPDATE passa a contar ──────────────

CREATE OR REPLACE FUNCTION public.fn_tvde_nasce_sem_data_fim() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  -- Segunda-feira 00:00 em Lisboa. Antes disto, as semanas já fecharam.
  v_semana timestamptz :=
    date_trunc('week', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon';
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A data que vinha em data_fim era, na prática, a da próxima renovação.
    IF NEW.data_fim IS NOT NULL THEN
      IF NEW.proxima_renovacao_em IS NULL THEN
        NEW.proxima_renovacao_em := NEW.data_fim;
      END IF;
      NEW.data_fim := NULL;
    END IF;

    IF COALESCE(NEW.is_longa_duracao, false)
       AND NEW.proxima_renovacao_em IS NULL
       AND NEW.data_inicio IS NOT NULL THEN
      NEW.proxima_renovacao_em := public.proxima_data_renovacao(
        NEW.data_inicio, NEW.renovacao_opcao::text, NEW.renovacao_intervalo_dias);
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE. Só manda enquanto o contrato está vivo: quando acaba (fechado,
  -- cancelado) ou é substituído, data_fim é o fim real e é ele que pára o
  -- aluguer — a troca de viatura escreve-o na versão que sai.
  IF NEW.substituido_em IS NOT NULL
     OR NEW.deleted_at IS NOT NULL
     OR NEW.estado_operacional NOT IN ('agendado', 'em_curso') THEN
    RETURN NEW;
  END IF;

  -- Alguém escreveu uma data de fim: queria dizer a próxima renovação.
  -- A data_fim fica como estava — NULL num TVDE normal; num de legado, a data
  -- antiga, porque trocá-la por outra mudava o que já se cobrou.
  IF NEW.data_fim IS NOT NULL AND NEW.data_fim IS DISTINCT FROM OLD.data_fim THEN
    IF NEW.proxima_renovacao_em IS NOT DISTINCT FROM OLD.proxima_renovacao_em THEN
      NEW.proxima_renovacao_em := NEW.data_fim;
    END IF;
    NEW.data_fim := OLD.data_fim;
    RETURN NEW;
  END IF;

  -- Apagar uma data de fim de legado que já ficou para trás cobrava as
  -- semanas desde então. Fica como estava — o caminho é Renovar (reabre a
  -- partir de hoje) ou Fechar. Não se recusa com erro de propósito: o
  -- formulário de TVDE manda data_fim = NULL em QUALQUER gravação
  -- (SectionEntregaRecolha), e um erro impedia o gestor de corrigir uma
  -- observação nestes contratos. Até hoje, essa gravação apagava a data e
  -- cobrava o retroactivo sem ninguém dar por isso.
  IF NEW.data_fim IS NULL AND OLD.data_fim IS NOT NULL AND OLD.data_fim < v_semana THEN
    NEW.data_fim := OLD.data_fim;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_tvde_nasce_sem_data_fim() IS
  'Um TVDE vivo não tem data_fim. INSERT: a data recebida vai para proxima_renovacao_em. UPDATE: escrever data_fim num TVDE vivo encaminha-a para proxima_renovacao_em; apagar uma data_fim de legado anterior à semana corrente é ignorado (a data fica), porque cobrava semanas já fechadas — o caminho é renovar_contrato_renting. Fechar/substituir o contrato não é tocado: aí data_fim é o fim real. Ver 20260924100000.';

DROP TRIGGER IF EXISTS trg_a_tvde_nasce_sem_data_fim ON public.contratos_renting;

-- Nome com "a_" para correr cedo: a data_fim tem de ficar resolvida antes das
-- triggers que dela dependem (a coluna gerada `periodo`, a cascata de datas e
-- a sincronização da atribuição motorista↔viatura).
CREATE TRIGGER trg_a_tvde_nasce_sem_data_fim
  BEFORE INSERT OR UPDATE OF data_fim, regime ON public.contratos_renting
  FOR EACH ROW
  WHEN (NEW.regime = 'tvde')
  EXECUTE FUNCTION public.fn_tvde_nasce_sem_data_fim();

-- ── 1. Limpar o legado seguro ─────────────────────────────────────────────
-- A trigger acima deixa passar (data_fim a NULL, fronteira respeitada).
-- trg_contrato_sincroniza_atribuicao reabre a atribuição motorista↔viatura
-- gerada por cada contrato; como a data_fim era desta semana ou futura, não
-- reabre dias passados.

UPDATE public.contratos_renting c
   SET proxima_renovacao_em = COALESCE(c.proxima_renovacao_em, c.data_fim),
       data_fim             = NULL
 WHERE c.regime = 'tvde'
   AND c.deleted_at IS NULL
   AND c.substituido_em IS NULL
   AND c.estado_operacional IN ('agendado', 'em_curso')
   AND c.data_fim IS NOT NULL
   AND c.data_fim >= date_trunc('week', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon'
   -- O mais antigo de cada par de viatura fica de fora.
   AND NOT EXISTS (
     SELECT 1
       FROM public.contratos_renting o
      WHERE o.org_id = c.org_id
        AND o.viatura_id = c.viatura_id
        AND o.id <> c.id
        AND o.deleted_at IS NULL
        AND o.substituido_em IS NULL
        AND o.estado_operacional IN ('agendado', 'em_curso')
        AND o.periodo && tstzrange(c.data_inicio, NULL)
        AND o.data_inicio >= c.data_inicio)
   -- Uma reserva activa por cima também rebentava (fn_contratos_validar_reserva).
   AND NOT EXISTS (
     SELECT 1
       FROM public.reservas r
      WHERE r.org_id = c.org_id
        AND r.viatura_id = c.viatura_id
        AND r.deleted_at IS NULL
        AND r.estado IN ('pendente', 'confirmada', 'em_curso')
        AND r.periodo && tstzrange(c.data_inicio, NULL)
        AND (c.reserva_id IS NULL OR r.id <> c.reserva_id));

-- ── 3. Renovar um TVDE ────────────────────────────────────────────────────
-- Igual a 20260908093000 até ao ramo TVDE. No ramo TVDE:
--   · data_fim NULL ou de legado desta semana/futura → limpa-a, avança a
--     próxima renovação, devolve o MESMO id (como antes);
--   · data_fim de legado de uma semana passada → o contrato reabre a partir
--     de hoje: a versão actual é substituída com a data_fim antiga INTACTA
--     (o que já se cobrou não muda) e nasce uma versão nova, com o mesmo
--     código, data_inicio = agora e sem data_fim. É o mesmo desenho da troca
--     de viatura, que os leitores do aluguer já sabem ler. As semanas entre o
--     fim antigo e hoje ficam sem aluguer, como estão hoje.

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
  v_semana         timestamptz;
  v_conflito       integer;
  v_cols           text;
  v_vals           text;
  v_km_percorridos integer;
  v_km_limite      integer;
  v_km_valor       numeric;
  v_km_excesso     integer;
  v_km_total       numeric;
  v_extra_km_id    uuid;
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

  -- ── Comum aos dois caminhos ────────────────────────────────────────────
  IF p_km_fim IS NOT NULL AND v_old.viatura_id IS NOT NULL THEN
    UPDATE public.viaturas
       SET km_atual = p_km_fim
     WHERE id = v_old.viatura_id
       AND (km_atual IS NULL OR p_km_fim >= km_atual);
  END IF;

  -- Km excedente do ciclo que fecha, lançado no contrato actual.
  IF p_km_inicio IS NOT NULL AND p_km_fim IS NOT NULL
     AND v_old.kms_incluidos IS NOT NULL THEN
    v_km_percorridos := p_km_fim - p_km_inicio;
    v_km_limite      := v_old.kms_incluidos;
    v_km_valor       := COALESCE(v_old.km_adicional_valor, 0);

    IF v_km_percorridos > v_km_limite AND v_km_valor > 0 THEN
      v_km_excesso := v_km_percorridos - v_km_limite;
      v_km_total   := v_km_excesso * v_km_valor;

      SELECT id INTO v_extra_km_id
        FROM public.renting_extras
       WHERE org_id = v_old.org_id AND nome = 'Km excedente'
       LIMIT 1;

      IF v_extra_km_id IS NULL THEN
        INSERT INTO public.renting_extras (org_id, nome, descricao, preco_unidade, tipo_calculo, ativo, created_by)
        VALUES (v_old.org_id, 'Km excedente',
                'Km acima do limite mensal — gerado automaticamente na renovação.',
                0, 'fixo', true, v_user_id)
        RETURNING id INTO v_extra_km_id;
      END IF;

      INSERT INTO public.contrato_extras (
        org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
      )
      VALUES (
        v_old.org_id, v_old.id, v_extra_km_id,
        'Km excedente (' || v_km_excesso || ' km × ' || to_char(v_km_valor, 'FM999990.00') || ' €)',
        v_km_valor, 'fixo', v_km_excesso, v_km_total
      );
    END IF;
  END IF;

  -- ── TVDE: renovar não tem fim ──────────────────────────────────────────
  IF v_old.regime = 'tvde' THEN
    -- A partir de HOJE, não do prazo antigo: quem está atrasado resolve numa
    -- renovação em vez de repetir o acto 30 dias de cada vez.
    v_fim := public.proxima_data_renovacao(
               now(), v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias);
    v_semana := date_trunc('week', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon';

    -- Sem data de fim, ou com uma de legado que ainda não fechou semana
    -- nenhuma: limpá-la não cobra nada para trás. Mesmo id, como sempre.
    IF v_old.data_fim IS NULL OR v_old.data_fim >= v_semana THEN
      UPDATE public.contratos_renting
         SET proxima_renovacao_em = v_fim,
             data_fim             = NULL,
             km_saida             = COALESCE(p_km_fim, km_saida),
             updated_by           = v_user_id
       WHERE id = v_old.id;

      INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
      VALUES (
        v_old.id, v_old.org_id, 'alteracao', v_user_id,
        'Renovado em ' || to_char(now(), 'DD/MM/YYYY') ||
        '. Próxima renovação: ' || to_char(v_fim, 'DD/MM/YYYY') ||
        '. A data de início do contrato mantém-se.'
      );

      RETURN v_old.id;
    END IF;

    -- Data de fim de legado de uma semana que já fechou: reabre a partir de
    -- hoje. Antes, a viatura tem de estar livre — senão a trava de
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
        'O contrato #% terminou a % e a viatura já está no contrato #%. Não se reabre por cima: fecha este contrato ou resolve o outro primeiro.',
        v_old.codigo, to_char(v_old.data_fim AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY'), v_conflito
        USING ERRCODE = 'check_violation';
    END IF;

    v_inicio := now();

    -- A versão que sai guarda a data_fim antiga: é ela que diz até onde já
    -- se cobrou. Mexer-lhe cobrava as semanas do meio.
    UPDATE public.contratos_renting
       SET substituido_em     = now(),
           estado_operacional = 'fechado'::contrato_estado_operacional_enum,
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
          'Renovação — reaberto a ' || to_char(v_inicio AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD') ||
          '; tinha terminado a ' || to_char(v_old.data_fim AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD') ||
          ' (sem aluguer no intervalo)',
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

    INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
    VALUES
      (v_old.id, v_old.org_id, 'alteracao', v_user_id,
       'Renovado em ' || to_char(now(), 'DD/MM/YYYY') || ' depois de ter terminado a ' ||
       to_char(v_old.data_fim AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
       '. Continua na versão ' || (v_old.versao + 1) || ', a partir de hoje; as semanas do intervalo ficam sem aluguer.'),
      (v_new_id, v_old.org_id, 'alteracao', v_user_id,
       'Reaberto em ' || to_char(now(), 'DD/MM/YYYY') || ' por renovação (continua a versão ' || v_old.versao ||
       '). Próxima renovação: ' || to_char(v_fim, 'DD/MM/YYYY') || '.');

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

COMMENT ON FUNCTION public.renovar_contrato_renting(uuid, integer, integer) IS
  'Renova um contrato de longa duração. TVDE: avança proxima_renovacao_em a partir de hoje e deixa data_fim a NULL; devolve o MESMO id — excepto quando o contrato tem uma data_fim de legado de uma semana já fechada: aí a versão actual é substituída com essa data intacta e nasce uma versão nova (mesmo código) a partir de agora, para não cobrar retroactivamente; recusa se a viatura estiver noutro contrato vivo. Rent-a-car: versiona como sempre, porque lá a versão é a unidade de facturação mensal. O km excedente do ciclo é lançado no contrato actual nos dois casos.';

-- Mesmas permissões de sempre (CREATE OR REPLACE mantém-nas; ficam explícitas).
REVOKE ALL ON FUNCTION public.renovar_contrato_renting(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renovar_contrato_renting(uuid, integer, integer) TO authenticated, service_role;

-- ── Depois de aplicar: pendentes para os gestores ─────────────────────────
-- TVDE vivos que continuam com data_fim — de legado anterior a esta semana,
-- ou excluídos por sobreposição. Cada um é Renovar (o motorista continua) ou
-- Fechar (já não está):
--
--   SELECT c.codigo, c.estado_operacional, c.matricula,
--          (c.data_fim AT TIME ZONE 'Europe/Lisbon')::date AS terminou_a,
--          (SELECT string_agg('#' || o.codigo, ', ')
--             FROM public.contratos_renting o
--            WHERE o.org_id = c.org_id AND o.viatura_id = c.viatura_id AND o.id <> c.id
--              AND o.deleted_at IS NULL AND o.substituido_em IS NULL
--              AND o.estado_operacional IN ('agendado', 'em_curso')) AS viatura_tambem_em
--     FROM public.contratos_renting c
--    WHERE c.regime = 'tvde' AND c.deleted_at IS NULL AND c.substituido_em IS NULL
--      AND c.estado_operacional IN ('agendado', 'em_curso') AND c.data_fim IS NOT NULL
--    ORDER BY c.data_fim;

-- O Supabase serve a API a partir de um cache do desenho da base: sem isto,
-- a coluna/trigger novos so sao reconhecidos na proxima vez que ele recarregar.
-- Ver AGENTS.md, "Toda a migracao que mexe em estrutura acaba com NOTIFY pgrst".
NOTIFY pgrst, 'reload schema';
