-- ============================================================
-- Bolt: o CSV deixa de pisar a semana que é da API oficial
-- ============================================================
-- O QUE ESTAVA MAL (dois buracos, o segundo é o grave)
--
-- 1. `ganhos_liquidos` e `pagamento_previsto` estavam FORA da guarda
--    `v_escreve_viagens` no UPDATE do bolt_resumo_merge_csv. Mesmo quando a
--    função decidia "as viagens são da API, o CSV entra só com os extras",
--    estas duas linhas escreviam à mesma. Desde a migração 20260813210000
--    `ganhos_liquidos` é o campo canónico que os ecrãs financeiros lêem — ou
--    seja, o CSV reescrevia exactamente o número que o utilizador vê.
--
-- 2. A única coisa que travava o CSV era um carimbo:
--       api_sincronizado_em > csv_importado_em
--    Um ficheiro importado hoje é sempre mais recente do que uma sincronização
--    de ontem. Numa integração ligada à API oficial, qualquer importação
--    manual ganhava — e as viagens todas da semana passavam a ser as do
--    ficheiro. Não era uma corrida que o CSV pudesse perder.
--
-- A CORRECÇÃO
--   · O líquido segue as viagens: só o escreve quem for dono delas.
--   · `auth_mode = 'oauth'` decide sem depender de datas — a API é a dona das
--     viagens dessa integração, e o CSV entra só com o que só ele traz
--     (ganhos_campanha, reembolsos_despesas, IVA, métricas do portal).
--
-- ESTADO EM PRODUÇÃO À DATA DESTA MIGRAÇÃO
-- 4399 semanas com fonte_viagens='api'; ZERO com CSV escrito por cima e ZERO
-- com o líquido desalinhado do api_net_earnings. O buraco ainda não tinha sido
-- pisado — fecha-se antes da próxima importação manual, não depois.
--
-- Nota: a importação manual do CSV continua disponível em qualquer modo. É
-- requisito explícito, e continua a ser a única fonte das campanhas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bolt_resumo_merge_csv(
  p_integracao_id    uuid,
  p_org_id           uuid,
  p_periodo_inicio   date,
  p_periodo_fim      date,
  p_valores          jsonb,
  p_periodo          text        DEFAULT NULL,
  p_motorista_id     uuid        DEFAULT NULL,
  p_escrever_viagens boolean     DEFAULT NULL,
  p_importado_em     timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rec             public.bolt_resumos_semanais%ROWTYPE;
  v_linha           public.bolt_resumos_semanais%ROWTYPE;
  v_chave           text;
  v_periodo         text;
  v_org             uuid;
  v_id              uuid;
  v_linhas          integer := 0;
  v_traz_viagens    boolean;
  v_escreve_viagens boolean;
  v_auth_mode       text;
  v_quando          timestamptz := COALESCE(p_importado_em, now());
BEGIN
  IF p_integracao_id IS NULL THEN
    RAISE EXCEPTION 'bolt_resumo_merge_csv: p_integracao_id é obrigatório.';
  END IF;
  IF p_periodo_inicio IS NULL OR p_periodo_fim IS NULL THEN
    RAISE EXCEPTION 'bolt_resumo_merge_csv: p_periodo_inicio e p_periodo_fim são obrigatórios.';
  END IF;

  v_rec := jsonb_populate_record(NULL::public.bolt_resumos_semanais, COALESCE(p_valores, '{}'::jsonb));

  v_periodo := COALESCE(
    NULLIF(btrim(p_periodo), ''),
    to_char(p_periodo_inicio, 'YYYY-MM-DD') || ' a ' || to_char(p_periodo_fim, 'YYYY-MM-DD')
  );

  -- A chave já vem calculada do TypeScript (construirChaveMotorista); se não
  -- vier, calcula-se aqui pela mesma regra.
  v_chave := COALESCE(
    NULLIF(btrim(v_rec.chave_motorista), ''),
    NULLIF(btrim(v_rec.identificador_motorista), ''),
    NULLIF(lower(btrim(v_rec.email)), ''),
    public.bolt_normalizar_nome(v_rec.motorista_nome)
  );
  IF v_chave IS NULL THEN
    RAISE EXCEPTION
      'bolt_resumo_merge_csv: linha sem identificador, email ou nome — não seria deduplicável (integração %, período %).',
      p_integracao_id, v_periodo;
  END IF;

  SELECT org_id, auth_mode INTO v_org, v_auth_mode
    FROM public.plataformas_configuracao
   WHERE id = p_integracao_id;

  IF v_org IS NULL THEN
    v_org := p_org_id;
  ELSIF p_org_id IS NOT NULL AND p_org_id <> v_org THEN
    RAISE EXCEPTION
      'bolt_resumo_merge_csv: p_org_id (%) não é a org da integração % (%).',
      p_org_id, p_integracao_id, v_org;
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION
      'bolt_resumo_merge_csv: sem org_id — a integração % não tem org e p_org_id veio NULL.',
      p_integracao_id;
  END IF;

  -- O ficheiro trouxe parcelas de viagens?
  v_traz_viagens := COALESCE(
    p_valores ?| ARRAY[
      'ganhos_brutos_app', 'ganhos_brutos_dinheiro', 'gorjetas', 'taxas_cancelamento',
      'comissoes', 'portagens', 'taxas_reserva', 'viagens_terminadas',
      'distancia_total_km', 'distancia_media_km'
    ],
    false
  );
  v_escreve_viagens := COALESCE(p_escrever_viagens, v_traz_viagens);

  -- Integração ligada à API oficial: as viagens são dela, ponto. Não é uma
  -- corrida de datas — é uma questão de quem manda. Antes isto decidia-se só
  -- pelo carimbo (ver a seguir), e um CSV importado hoje ganhava sempre a uma
  -- sincronização de ontem, mesmo com a API ligada. O CSV continua a entrar
  -- com os extras que só ele traz (campanhas, reembolsos de despesas, IVA).
  -- p_escrever_viagens = true continua a mandar: é a porta de serviço para um
  -- reprocessamento deliberado. Nenhum chamador a usa hoje.
  IF v_auth_mode = 'oauth' AND p_escrever_viagens IS DISTINCT FROM true THEN
    v_escreve_viagens := false;
  END IF;

  -- Trava a linha antes de decidir, para uma sincronização da API a meio do
  -- import não mudar a resposta entre a leitura e a escrita.
  SELECT * INTO v_linha
    FROM public.bolt_resumos_semanais
   WHERE integracao_id = p_integracao_id
     AND periodo = v_periodo
     AND chave_motorista = v_chave
   FOR UPDATE;

  IF FOUND
     AND v_linha.fonte_viagens = 'api'
     AND v_linha.api_sincronizado_em IS NOT NULL
     AND v_linha.api_sincronizado_em > v_quando
  THEN
    -- A API é mais recente do que este ficheiro: dentro do território dela
    -- manda ela. O CSV entra só com os extras.
    v_escreve_viagens := false;
  END IF;

  IF v_linha.id IS NULL THEN
    INSERT INTO public.bolt_resumos_semanais (
      integracao_id, org_id, periodo, periodo_inicio, periodo_fim,
      chave_motorista, identificador_motorista, identificador_individual,
      motorista_nome, email, telefone, motorista_id,
      -- extras: sempre do CSV
      ganhos_campanha, reembolsos_despesas,
      iva_ganhos_app, iva_ganhos_dinheiro, iva_taxas_cancelamento, iva_taxas_reserva,
      dinheiro_recebido, total_taxas, outras_taxas, reembolsos_passageiros,
      ganhos_liquidos, pagamento_previsto, ganhos_brutos_hora, ganhos_liquidos_hora,
      desconto_comissao_app, desconto_comissao_dinheiro,
      nivel, categorias_ativas, viagens_dinheiro_ativadas, pontuacao_motorista,
      taxa_aceitacao, tempo_online_min, utilizacao,
      taxa_finalizacao_todas, taxa_finalizacao_aceites, classificacao_media,
      raw_data,
      -- viagens: só quando o CSV as pode escrever
      ganhos_brutos_app, ganhos_brutos_dinheiro, gorjetas, taxas_cancelamento,
      comissoes, portagens, taxas_reserva,
      viagens_terminadas, distancia_total_km, distancia_media_km,
      fonte_viagens, fonte_extras, csv_importado_em, updated_at
    ) VALUES (
      p_integracao_id, v_org, v_periodo, p_periodo_inicio, p_periodo_fim,
      v_chave,
      NULLIF(btrim(v_rec.identificador_motorista), ''),
      NULLIF(btrim(v_rec.identificador_individual), ''),
      NULLIF(btrim(v_rec.motorista_nome), ''),
      NULLIF(lower(btrim(v_rec.email)), ''),
      NULLIF(btrim(v_rec.telefone), ''),
      COALESCE(p_motorista_id, v_rec.motorista_id),
      COALESCE(v_rec.ganhos_campanha, 0), COALESCE(v_rec.reembolsos_despesas, 0),
      COALESCE(v_rec.iva_ganhos_app, 0), COALESCE(v_rec.iva_ganhos_dinheiro, 0),
      COALESCE(v_rec.iva_taxas_cancelamento, 0), COALESCE(v_rec.iva_taxas_reserva, 0),
      COALESCE(v_rec.dinheiro_recebido, 0), COALESCE(v_rec.total_taxas, 0),
      COALESCE(v_rec.outras_taxas, 0), COALESCE(v_rec.reembolsos_passageiros, 0),
      COALESCE(v_rec.ganhos_liquidos, 0), COALESCE(v_rec.pagamento_previsto, 0),
      COALESCE(v_rec.ganhos_brutos_hora, 0), COALESCE(v_rec.ganhos_liquidos_hora, 0),
      COALESCE(v_rec.desconto_comissao_app, 0), COALESCE(v_rec.desconto_comissao_dinheiro, 0),
      v_rec.nivel, v_rec.categorias_ativas, v_rec.viagens_dinheiro_ativadas,
      COALESCE(v_rec.pontuacao_motorista, 0), COALESCE(v_rec.taxa_aceitacao, 0),
      COALESCE(v_rec.tempo_online_min, 0), COALESCE(v_rec.utilizacao, 0),
      COALESCE(v_rec.taxa_finalizacao_todas, 0), COALESCE(v_rec.taxa_finalizacao_aceites, 0),
      COALESCE(v_rec.classificacao_media, 0),
      v_rec.raw_data,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.ganhos_brutos_app, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.ganhos_brutos_dinheiro, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.gorjetas, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.taxas_cancelamento, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.comissoes, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.portagens, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.taxas_reserva, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.viagens_terminadas, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.distancia_total_km, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.distancia_media_km, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN 'csv' ELSE NULL END,
      'csv', v_quando, now()
    )
    -- Linha criada por outra sessão entre o SELECT e o INSERT: cai para o UPDATE.
    ON CONFLICT (integracao_id, periodo, chave_motorista) DO NOTHING
    RETURNING id INTO v_id;

    GET DIAGNOSTICS v_linhas = ROW_COUNT;
  END IF;

  IF v_id IS NULL THEN
    UPDATE public.bolt_resumos_semanais SET
      org_id                  = COALESCE(org_id, v_org),
      periodo_inicio          = COALESCE(p_periodo_inicio, periodo_inicio),
      periodo_fim             = COALESCE(p_periodo_fim, periodo_fim),
      identificador_motorista = COALESCE(NULLIF(btrim(v_rec.identificador_motorista), ''), identificador_motorista),
      identificador_individual = COALESCE(NULLIF(btrim(v_rec.identificador_individual), ''), identificador_individual),
      motorista_nome          = COALESCE(NULLIF(btrim(v_rec.motorista_nome), ''), motorista_nome),
      email                   = COALESCE(NULLIF(lower(btrim(v_rec.email)), ''), email),
      telefone                = COALESCE(NULLIF(btrim(v_rec.telefone), ''), telefone),
      motorista_id            = COALESCE(motorista_id, p_motorista_id, v_rec.motorista_id),

      -- Extras e colunas exclusivas do CSV: escreve o que o ficheiro trouxe.
      ganhos_campanha            = COALESCE(v_rec.ganhos_campanha, ganhos_campanha),
      reembolsos_despesas        = COALESCE(v_rec.reembolsos_despesas, reembolsos_despesas),
      iva_ganhos_app             = COALESCE(v_rec.iva_ganhos_app, iva_ganhos_app),
      iva_ganhos_dinheiro        = COALESCE(v_rec.iva_ganhos_dinheiro, iva_ganhos_dinheiro),
      iva_taxas_cancelamento     = COALESCE(v_rec.iva_taxas_cancelamento, iva_taxas_cancelamento),
      iva_taxas_reserva          = COALESCE(v_rec.iva_taxas_reserva, iva_taxas_reserva),
      dinheiro_recebido          = COALESCE(v_rec.dinheiro_recebido, dinheiro_recebido),
      total_taxas                = COALESCE(v_rec.total_taxas, total_taxas),
      outras_taxas               = COALESCE(v_rec.outras_taxas, outras_taxas),
      reembolsos_passageiros     = COALESCE(v_rec.reembolsos_passageiros, reembolsos_passageiros),
      -- O líquido segue as viagens: é dono dele quem for dono delas. Estas
      -- duas linhas estavam FORA da guarda, por isso um CSV importado por cima
      -- de uma semana já trazida pela API reescrevia o líquido dela. Ver a
      -- migração 20260813220000.
      ganhos_liquidos            = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.ganhos_liquidos, ganhos_liquidos) ELSE ganhos_liquidos END,
      pagamento_previsto         = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.pagamento_previsto, pagamento_previsto) ELSE pagamento_previsto END,
      ganhos_brutos_hora         = COALESCE(v_rec.ganhos_brutos_hora, ganhos_brutos_hora),
      ganhos_liquidos_hora       = COALESCE(v_rec.ganhos_liquidos_hora, ganhos_liquidos_hora),
      desconto_comissao_app      = COALESCE(v_rec.desconto_comissao_app, desconto_comissao_app),
      desconto_comissao_dinheiro = COALESCE(v_rec.desconto_comissao_dinheiro, desconto_comissao_dinheiro),
      nivel                      = COALESCE(v_rec.nivel, nivel),
      categorias_ativas          = COALESCE(v_rec.categorias_ativas, categorias_ativas),
      viagens_dinheiro_ativadas  = COALESCE(v_rec.viagens_dinheiro_ativadas, viagens_dinheiro_ativadas),
      pontuacao_motorista        = COALESCE(v_rec.pontuacao_motorista, pontuacao_motorista),
      taxa_aceitacao             = COALESCE(v_rec.taxa_aceitacao, taxa_aceitacao),
      tempo_online_min           = COALESCE(v_rec.tempo_online_min, tempo_online_min),
      utilizacao                 = COALESCE(v_rec.utilizacao, utilizacao),
      taxa_finalizacao_todas     = COALESCE(v_rec.taxa_finalizacao_todas, taxa_finalizacao_todas),
      taxa_finalizacao_aceites   = COALESCE(v_rec.taxa_finalizacao_aceites, taxa_finalizacao_aceites),
      classificacao_media        = COALESCE(v_rec.classificacao_media, classificacao_media),
      raw_data                   = COALESCE(v_rec.raw_data, raw_data),

      -- Território das viagens: só se o CSV o ganhou.
      ganhos_brutos_app      = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.ganhos_brutos_app, ganhos_brutos_app) ELSE ganhos_brutos_app END,
      ganhos_brutos_dinheiro = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.ganhos_brutos_dinheiro, ganhos_brutos_dinheiro) ELSE ganhos_brutos_dinheiro END,
      gorjetas               = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.gorjetas, gorjetas) ELSE gorjetas END,
      taxas_cancelamento     = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.taxas_cancelamento, taxas_cancelamento) ELSE taxas_cancelamento END,
      comissoes              = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.comissoes, comissoes) ELSE comissoes END,
      portagens              = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.portagens, portagens) ELSE portagens END,
      taxas_reserva          = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.taxas_reserva, taxas_reserva) ELSE taxas_reserva END,
      viagens_terminadas     = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.viagens_terminadas, viagens_terminadas) ELSE viagens_terminadas END,
      distancia_total_km     = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.distancia_total_km, distancia_total_km) ELSE distancia_total_km END,
      distancia_media_km     = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.distancia_media_km, distancia_media_km) ELSE distancia_media_km END,
      fonte_viagens          = CASE WHEN v_escreve_viagens THEN 'csv' ELSE fonte_viagens END,

      fonte_extras           = 'csv',
      csv_importado_em       = v_quando,
      updated_at             = now()
      -- Fora daqui, de propósito: ganhos_brutos_total (recalculado a seguir) e
      -- todas as colunas api_* + api_sincronizado_em, que são da API.
    WHERE integracao_id = p_integracao_id
      AND periodo = v_periodo
      AND chave_motorista = v_chave
    RETURNING id INTO v_id;

    GET DIAGNOSTICS v_linhas = ROW_COUNT;
  END IF;

  IF v_id IS NOT NULL THEN
    PERFORM public.bolt_resumo_recalcular_total(v_id);
  END IF;

  RETURN v_linhas;
END;
$$;


COMMENT ON FUNCTION public.bolt_resumo_merge_csv(
  uuid, uuid, date, date, jsonb, text, uuid, boolean, timestamptz
) IS
  'Merge do CSV do portal Bolt no resumo semanal. Numa integração em auth_mode=''oauth'' '
  'as viagens E o líquido são da API — o CSV entra só com os extras que só ele traz '
  '(campanhas, reembolsos de despesas, IVA, métricas). Ver migração 20260813220000.';
