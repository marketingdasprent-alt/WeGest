-- supabase/migrations/20260804140000_bolt_merge_por_fonte.sql
-- ============================================================================
-- Bolt: merge por campo entre a API de frota e o CSV semanal
-- ============================================================================
--
-- PORQUÊ
-- O mesmo resumo semanal de um motorista passa a ter duas fontes a escrever
-- nele: a API oficial (getFleetOrders, agregada por motorista/semana) e o CSV
-- do portal (importação manual). Se cada uma gravasse a linha inteira, a última
-- a correr apagava o trabalho da outra:
--   * a API não sabe o que são campanhas nem reembolsos de despesas — esses
--     conceitos NÃO EXISTEM em lado nenhum da API — e ao gravar punha-os a zero;
--   * o CSV é um retrato de um instante e, reimportado dias depois, deitava
--     abaixo viagens que a API já tinha corrigido entretanto.
--
-- A IDENTIDADE (provada sobre 4312 linhas reais, resíduo 0,00 EUR em 9 semanas)
--
--   ganhos_brutos_total = ganhos_brutos_app + ganhos_brutos_dinheiro
--                       + gorjetas + taxas_cancelamento
--                       + ganhos_campanha + reembolsos_despesas
--
-- PROPRIEDADE POR CAMPO — cada coluna tem um dono, ninguém pisa o outro
--   * A API é dona de: ganhos_brutos_app, ganhos_brutos_dinheiro, gorjetas,
--     taxas_cancelamento, comissoes, portagens, taxas_reserva,
--     viagens_terminadas, distancia_total_km, distancia_media_km.
--   * O CSV é dono de: ganhos_campanha, reembolsos_despesas e de tudo o que só
--     ele traz (nivel, pontuacao_motorista, taxa_aceitacao, utilizacao, taxas de
--     finalização, ganhos por hora, descontos de comissão, classificacao_media,
--     os IVA, total_taxas, outras_taxas, reembolsos_passageiros,
--     dinheiro_recebido, ganhos_liquidos, pagamento_previsto).
--   * ganhos_brutos_total NÃO É DE NINGUÉM: é sempre RECALCULADO da soma acima,
--     a partir dos valores já gravados na linha, por quem quer que escreva.
--
-- Consequência prática: correr a API 10x por dia é seguro e nunca destrói uma
-- campanha importada por CSV; reimportar o CSV corrige a campanha sem destruir
-- viagens mais recentes da API.
--
-- RLS — VERIFICADO EM 2026-08-04, NADA DE NOVO AQUI
-- As políticas de public.bolt_resumos_semanais já existentes e conferidas por
-- SELECT a pg_policies são:
--   * mt_bolt_resumos_all  (ALL, authenticated) org_id = get_current_org_id() AND can_view_financeiro()
--   * rls_org_isolation    (ALL, authenticated) org_id = get_current_org_id()
--   * rls_deny_anon        (ALL, anon)          false
-- Esta migração NÃO cria, altera nem remove nenhuma política. As duas RPC são
-- SECURITY DEFINER (bypassam RLS) e por isso só o service_role as pode executar
-- — ver os GRANT/REVOKE no fim. Quem as chama é sempre uma edge function com a
-- service-role key, que já bypassa RLS na mesma; a diferença é que aqui a org
-- é validada à mão contra plataformas_configuracao.
--
-- IDEMPOTENTE E ADITIVA: pode correr as vezes que forem precisas. Não apaga
-- linhas, não altera dados históricos, não larga colunas.
-- ============================================================================


-- ─── 0. Pré-condição: a migração da chave estável tem de vir primeiro ────────
-- As duas RPC fazem upsert por (integracao_id, periodo, chave_motorista). Essa
-- coluna, o índice único que o ON CONFLICT precisa de inferir e a função
-- bolt_normalizar_nome vêm de 20260804120000_bolt_resumos_chave_motorista.sql.
-- Sem isso, as funções seriam criadas na mesma (o corpo plpgsql só é validado
-- em execução) e só rebentariam à primeira sincronização — falhar aqui, alto e
-- cedo, é muito melhor.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'bolt_resumos_semanais'
       AND column_name = 'chave_motorista'
  ) THEN
    RAISE EXCEPTION
      'Falta a coluna bolt_resumos_semanais.chave_motorista. Corre primeiro a migração 20260804120000_bolt_resumos_chave_motorista.sql.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'bolt_resumos_semanais_chave_unica' AND relkind = 'i'
  ) THEN
    RAISE EXCEPTION
      'Falta o índice único bolt_resumos_semanais_chave_unica. Corre primeiro a migração 20260804120000_bolt_resumos_chave_motorista.sql (inclui o dedupe que o índice exige).';
  END IF;

  IF to_regprocedure('public.bolt_normalizar_nome(text)') IS NULL THEN
    RAISE EXCEPTION
      'Falta a função public.bolt_normalizar_nome(text). Corre primeiro a migração 20260804120000_bolt_resumos_chave_motorista.sql.';
  END IF;
END;
$$;


-- ─── 1. Rastreio de fonte ────────────────────────────────────────────────────

ALTER TABLE public.bolt_resumos_semanais
  ADD COLUMN IF NOT EXISTS fonte_viagens       text,
  ADD COLUMN IF NOT EXISTS fonte_extras        text,
  ADD COLUMN IF NOT EXISTS api_sincronizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS csv_importado_em    timestamptz;

COMMENT ON COLUMN public.bolt_resumos_semanais.fonte_viagens IS
  'Quem escreveu por último as parcelas de VIAGENS desta linha: ''api'' ou ''csv''. '
  'Parcelas de viagens = ganhos_brutos_app, ganhos_brutos_dinheiro, gorjetas, '
  'taxas_cancelamento, comissoes, portagens, taxas_reserva, viagens_terminadas, '
  'distancia_total_km, distancia_media_km. NULL = linha legada, importada antes '
  'do merge por fonte (assume-se CSV, mas não foi carimbada).';

COMMENT ON COLUMN public.bolt_resumos_semanais.fonte_extras IS
  'Quem escreveu por último os EXTRAS desta linha: ''api'' ou ''csv''. Na prática é '
  'sempre ''csv'' — extras = ganhos_campanha e reembolsos_despesas, que NÃO EXISTEM '
  'na API da Bolt (nem campanhas, nem bónus, nem reembolsos de despesas, nem '
  'ajustes). bolt_resumo_merge_api nunca toca nesta coluna nem nesses valores. '
  'NULL = linha legada.';

COMMENT ON COLUMN public.bolt_resumos_semanais.api_sincronizado_em IS
  'Instante da última escrita vinda da API (bolt_resumo_merge_api). Serve de '
  'árbitro: uma importação de CSV só sobrepõe as parcelas de viagens se for '
  'mais recente do que este carimbo.';

COMMENT ON COLUMN public.bolt_resumos_semanais.csv_importado_em IS
  'Instante da última escrita vinda do CSV do portal (bolt_resumo_merge_csv).';

-- Domínio dos dois carimbos. NULL continua a ser válido (linhas legadas).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bolt_resumos_fonte_viagens_valida'
  ) THEN
    ALTER TABLE public.bolt_resumos_semanais
      ADD CONSTRAINT bolt_resumos_fonte_viagens_valida
      CHECK (fonte_viagens IS NULL OR fonte_viagens IN ('api', 'csv'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bolt_resumos_fonte_extras_valida'
  ) THEN
    ALTER TABLE public.bolt_resumos_semanais
      ADD CONSTRAINT bolt_resumos_fonte_extras_valida
      CHECK (fonte_extras IS NULL OR fonte_extras IN ('api', 'csv'));
  END IF;
END;
$$;


-- ─── 2. Parcelas em bruto da API ─────────────────────────────────────────────
-- OrderPriceData tem exactamente 9 campos e a tabela não guardava nenhum deles
-- em separado. Guardá-los em bruto é o que permite ESCOLHER A FÓRMULA depois,
-- sem voltar a chamar a API: ainda não se sabe se ride_price já engloba
-- booking_fee e toll_fee. A calibração faz-se comparando com a semana de
-- referência 2026-07-06 (alvo app+gorjetas+cancelamentos = 68.923,66 EUR).
--
-- Estas colunas são AUDITORIA, não são o financeiro: quem manda no financeiro
-- continuam a ser as colunas de negócio (ganhos_brutos_app, …), que a edge
-- function preenche com a variante escolhida da fórmula.

ALTER TABLE public.bolt_resumos_semanais
  ADD COLUMN IF NOT EXISTS api_ride_price       numeric(12,2),
  ADD COLUMN IF NOT EXISTS api_booking_fee      numeric(12,2),
  ADD COLUMN IF NOT EXISTS api_toll_fee         numeric(12,2),
  ADD COLUMN IF NOT EXISTS api_cancellation_fee numeric(12,2),
  ADD COLUMN IF NOT EXISTS api_tip              numeric(12,2),
  ADD COLUMN IF NOT EXISTS api_net_earnings     numeric(12,2),
  ADD COLUMN IF NOT EXISTS api_cash_discount    numeric(12,2),
  ADD COLUMN IF NOT EXISTS api_in_app_discount  numeric(12,2),
  ADD COLUMN IF NOT EXISTS api_commission       numeric(12,2),
  ADD COLUMN IF NOT EXISTS api_orders_total     integer,
  ADD COLUMN IF NOT EXISTS api_orders_finished  integer,
  ADD COLUMN IF NOT EXISTS api_orders_cash      integer,
  ADD COLUMN IF NOT EXISTS api_ride_distance    numeric(12,2);

COMMENT ON COLUMN public.bolt_resumos_semanais.api_ride_price IS
  'Soma de order_price.ride_price das corridas da semana (getFleetOrders). Bruto, '
  'para auditoria e calibração — NÃO se sabe ainda se já engloba booking_fee e toll_fee.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_booking_fee IS
  'Soma de order_price.booking_fee. Bruto da API, para auditoria e calibração.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_toll_fee IS
  'Soma de order_price.toll_fee. Bruto da API, para auditoria e calibração.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_cancellation_fee IS
  'Soma de order_price.cancellation_fee. Bruto da API, para auditoria e calibração.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_tip IS
  'Soma de order_price.tip. Bruto da API, para auditoria e calibração.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_net_earnings IS
  'Soma de order_price.net_earnings. Bruto da API. NÃO escreve ganhos_liquidos — '
  'essa coluna é do CSV e as duas definições podem não coincidir.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_cash_discount IS
  'Soma de order_price.cash_discount. Bruto da API, para auditoria e calibração.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_in_app_discount IS
  'Soma de order_price.in_app_discount. Bruto da API, para auditoria e calibração.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_commission IS
  'Soma de order_price.commission. Bruto da API; é daqui que sai comissoes.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_orders_total IS
  'Corridas devolvidas pela API para este motorista/semana, em qualquer estado.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_orders_finished IS
  'Corridas com order_status de terminada. É daqui que sai viagens_terminadas.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_orders_cash IS
  'Corridas com payment_method de dinheiro.';
COMMENT ON COLUMN public.bolt_resumos_semanais.api_ride_distance IS
  'Soma de ride_distance tal como a API a devolve, SEM CONVERSÃO. A unidade não '
  'está confirmada (provavelmente metros) — quem escreve distancia_total_km é que '
  'faz a conversão; esta coluna fica com o valor cru para se poder conferir.';


-- ─── 3. Índice para as consultas por semana ──────────────────────────────────
-- Mesmo nome e mesma definição do índice criado por 20260804120000, de propósito:
-- assim, se essa migração já correu, isto é um no-op e não fica um índice
-- duplicado a pesar nas escritas.

CREATE INDEX IF NOT EXISTS idx_bolt_resumos_integracao_inicio
  ON public.bolt_resumos_semanais (integracao_id, periodo_inicio DESC);


-- ─── 4. O sítio ÚNICO onde vive a identidade do bruto total ──────────────────
-- Auxiliar interno das duas RPC. Recalcula sempre a partir do que está GRAVADO
-- na linha — nunca de valores vindos do chamador — para que o total esteja certo
-- independentemente de quem escreveu cada parcela e por que ordem.
--
-- Não é um trigger de propósito: um trigger passaria a mexer também nas
-- gravações antigas (a importação de CSV actual escreve ganhos_brutos_total
-- directamente do ficheiro) e alterava histórico sem ninguém pedir.

CREATE OR REPLACE FUNCTION public.bolt_resumo_recalcular_total(p_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  UPDATE public.bolt_resumos_semanais
     SET ganhos_brutos_total =
           COALESCE(ganhos_brutos_app, 0)
         + COALESCE(ganhos_brutos_dinheiro, 0)
         + COALESCE(gorjetas, 0)
         + COALESCE(taxas_cancelamento, 0)
         + COALESCE(ganhos_campanha, 0)
         + COALESCE(reembolsos_despesas, 0),
         updated_at = now()
   WHERE id = p_id
  RETURNING ganhos_brutos_total INTO v_total;

  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.bolt_resumo_recalcular_total(uuid) IS
  'Recalcula ganhos_brutos_total de uma linha de bolt_resumos_semanais a partir '
  'das parcelas já gravadas: app + dinheiro + gorjetas + cancelamentos + campanha '
  '+ reembolsos de despesas. Identidade provada sobre 4312 linhas (resíduo 0,00 EUR '
  'em 9 semanas). Uso interno de bolt_resumo_merge_api e bolt_resumo_merge_csv.';


-- ─── 5. RPC do lado da API ───────────────────────────────────────────────────
--
-- Escreve SÓ o que é da API. Nunca lê nem escreve ganhos_campanha,
-- reembolsos_despesas ou qualquer coluna exclusiva do CSV — a única coisa que
-- faz com elas é somá-las no total, já depois de gravadas, através de
-- bolt_resumo_recalcular_total.
--
-- CHAVE DE MERGE: p_identificador_motorista tem de receber o driver_uuid que
-- vem em FleetOrder. É o mesmo valor que o CSV grava na coluna "Identificador do
-- motorista" (ambos são UUID). ANTES do primeiro sync completo, conferir numa
-- semana já importada que os dois conjuntos se cruzam — se não se cruzarem, a
-- API cria linhas novas em vez de completar as do CSV. A query está no fim do
-- ficheiro.

CREATE OR REPLACE FUNCTION public.bolt_resumo_merge_api(
  p_integracao_id           uuid,
  p_org_id                  uuid,
  p_periodo_inicio          date,
  p_periodo_fim             date,
  p_identificador_motorista text        DEFAULT NULL,
  p_motorista_nome          text        DEFAULT NULL,
  p_email                   text        DEFAULT NULL,
  p_telefone                text        DEFAULT NULL,
  p_motorista_id            uuid        DEFAULT NULL,
  p_periodo                 text        DEFAULT NULL,
  -- parcelas de que a API é dona (a fórmula escolhida já vem resolvida daqui)
  p_ganhos_brutos_app       numeric     DEFAULT 0,
  p_ganhos_brutos_dinheiro  numeric     DEFAULT 0,
  p_gorjetas                numeric     DEFAULT 0,
  p_taxas_cancelamento      numeric     DEFAULT 0,
  p_comissoes               numeric     DEFAULT 0,
  p_portagens               numeric     DEFAULT 0,
  p_taxas_reserva           numeric     DEFAULT 0,
  p_viagens_terminadas      integer     DEFAULT 0,
  p_distancia_total_km      numeric     DEFAULT 0,
  p_distancia_media_km      numeric     DEFAULT 0,
  -- parcelas em bruto de OrderPriceData (auditoria/calibração)
  p_api_ride_price          numeric     DEFAULT NULL,
  p_api_booking_fee         numeric     DEFAULT NULL,
  p_api_toll_fee            numeric     DEFAULT NULL,
  p_api_cancellation_fee    numeric     DEFAULT NULL,
  p_api_tip                 numeric     DEFAULT NULL,
  p_api_net_earnings        numeric     DEFAULT NULL,
  p_api_cash_discount       numeric     DEFAULT NULL,
  p_api_in_app_discount     numeric     DEFAULT NULL,
  p_api_commission          numeric     DEFAULT NULL,
  p_api_orders_total        integer     DEFAULT NULL,
  p_api_orders_finished     integer     DEFAULT NULL,
  p_api_orders_cash         integer     DEFAULT NULL,
  p_api_ride_distance       numeric     DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_chave   text;
  v_periodo text;
  v_org     uuid;
  v_id      uuid;
  v_linhas  integer;
BEGIN
  IF p_integracao_id IS NULL THEN
    RAISE EXCEPTION 'bolt_resumo_merge_api: p_integracao_id é obrigatório.';
  END IF;
  IF p_periodo_inicio IS NULL OR p_periodo_fim IS NULL THEN
    RAISE EXCEPTION 'bolt_resumo_merge_api: p_periodo_inicio e p_periodo_fim são obrigatórios.';
  END IF;

  -- Formato exacto do que já está gravado: 'YYYY-MM-DD a YYYY-MM-DD'. Inventar
  -- outro formato criaria um universo paralelo de linhas para a mesma semana.
  v_periodo := COALESCE(
    NULLIF(btrim(p_periodo), ''),
    to_char(p_periodo_inicio, 'YYYY-MM-DD') || ' a ' || to_char(p_periodo_fim, 'YYYY-MM-DD')
  );

  -- Mesma regra do construirChaveMotorista do TypeScript e do backfill de
  -- 20260804120000: identificador → email → nome normalizado.
  v_chave := COALESCE(
    NULLIF(btrim(p_identificador_motorista), ''),
    NULLIF(lower(btrim(p_email)), ''),
    public.bolt_normalizar_nome(p_motorista_nome)
  );
  IF v_chave IS NULL THEN
    RAISE EXCEPTION
      'bolt_resumo_merge_api: motorista sem identificador, email ou nome — a linha não seria deduplicável (integração %, período %).',
      p_integracao_id, v_periodo;
  END IF;

  -- A org da integração é a verdade; p_org_id só serve de confirmação. Isto
  -- fecha a porta a uma escrita cruzada entre organizações vinda de um
  -- chamador distraído (a função é SECURITY DEFINER, não há RLS a apanhar).
  SELECT org_id INTO v_org
    FROM public.plataformas_configuracao
   WHERE id = p_integracao_id;

  IF v_org IS NULL THEN
    v_org := p_org_id;
  ELSIF p_org_id IS NOT NULL AND p_org_id <> v_org THEN
    RAISE EXCEPTION
      'bolt_resumo_merge_api: p_org_id (%) não é a org da integração % (%).',
      p_org_id, p_integracao_id, v_org;
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION
      'bolt_resumo_merge_api: sem org_id — a integração % não tem org e p_org_id veio NULL.',
      p_integracao_id;
  END IF;

  INSERT INTO public.bolt_resumos_semanais AS r (
    integracao_id, org_id, periodo, periodo_inicio, periodo_fim,
    chave_motorista, identificador_motorista, motorista_nome, email, telefone, motorista_id,
    ganhos_brutos_app, ganhos_brutos_dinheiro, gorjetas, taxas_cancelamento,
    comissoes, portagens, taxas_reserva,
    viagens_terminadas, distancia_total_km, distancia_media_km,
    api_ride_price, api_booking_fee, api_toll_fee, api_cancellation_fee, api_tip,
    api_net_earnings, api_cash_discount, api_in_app_discount, api_commission,
    api_orders_total, api_orders_finished, api_orders_cash, api_ride_distance,
    fonte_viagens, api_sincronizado_em, updated_at
  ) VALUES (
    p_integracao_id, v_org, v_periodo, p_periodo_inicio, p_periodo_fim,
    v_chave,
    NULLIF(btrim(p_identificador_motorista), ''),
    NULLIF(btrim(p_motorista_nome), ''),
    NULLIF(lower(btrim(p_email)), ''),
    NULLIF(btrim(p_telefone), ''),
    p_motorista_id,
    COALESCE(p_ganhos_brutos_app, 0), COALESCE(p_ganhos_brutos_dinheiro, 0),
    COALESCE(p_gorjetas, 0), COALESCE(p_taxas_cancelamento, 0),
    COALESCE(p_comissoes, 0), COALESCE(p_portagens, 0), COALESCE(p_taxas_reserva, 0),
    COALESCE(p_viagens_terminadas, 0), COALESCE(p_distancia_total_km, 0),
    COALESCE(p_distancia_media_km, 0),
    p_api_ride_price, p_api_booking_fee, p_api_toll_fee, p_api_cancellation_fee, p_api_tip,
    p_api_net_earnings, p_api_cash_discount, p_api_in_app_discount, p_api_commission,
    p_api_orders_total, p_api_orders_finished, p_api_orders_cash, p_api_ride_distance,
    'api', now(), now()
  )
  ON CONFLICT (integracao_id, periodo, chave_motorista) DO UPDATE SET
    -- Identificação: só preenche buracos, nunca apaga o que o CSV já sabia.
    org_id                  = COALESCE(r.org_id, EXCLUDED.org_id),
    periodo_inicio          = COALESCE(EXCLUDED.periodo_inicio, r.periodo_inicio),
    periodo_fim             = COALESCE(EXCLUDED.periodo_fim, r.periodo_fim),
    identificador_motorista = COALESCE(r.identificador_motorista, EXCLUDED.identificador_motorista),
    motorista_nome          = COALESCE(EXCLUDED.motorista_nome, r.motorista_nome),
    email                   = COALESCE(EXCLUDED.email, r.email),
    telefone                = COALESCE(EXCLUDED.telefone, r.telefone),
    -- Mapeamento para o motorista da WeGest: feito à mão ou por
    -- bolt-auto-map-drivers; a API não o desfaz.
    motorista_id            = COALESCE(r.motorista_id, EXCLUDED.motorista_id),

    -- Território da API: substitui sempre, é o dado mais actual.
    ganhos_brutos_app       = EXCLUDED.ganhos_brutos_app,
    ganhos_brutos_dinheiro  = EXCLUDED.ganhos_brutos_dinheiro,
    gorjetas                = EXCLUDED.gorjetas,
    taxas_cancelamento      = EXCLUDED.taxas_cancelamento,
    comissoes               = EXCLUDED.comissoes,
    portagens               = EXCLUDED.portagens,
    taxas_reserva           = EXCLUDED.taxas_reserva,
    viagens_terminadas      = EXCLUDED.viagens_terminadas,
    distancia_total_km      = EXCLUDED.distancia_total_km,
    distancia_media_km      = EXCLUDED.distancia_media_km,

    -- Auditoria em bruto: a API é a única escritora, substitui sempre.
    api_ride_price          = EXCLUDED.api_ride_price,
    api_booking_fee         = EXCLUDED.api_booking_fee,
    api_toll_fee            = EXCLUDED.api_toll_fee,
    api_cancellation_fee    = EXCLUDED.api_cancellation_fee,
    api_tip                 = EXCLUDED.api_tip,
    api_net_earnings        = EXCLUDED.api_net_earnings,
    api_cash_discount       = EXCLUDED.api_cash_discount,
    api_in_app_discount     = EXCLUDED.api_in_app_discount,
    api_commission          = EXCLUDED.api_commission,
    api_orders_total        = EXCLUDED.api_orders_total,
    api_orders_finished     = EXCLUDED.api_orders_finished,
    api_orders_cash         = EXCLUDED.api_orders_cash,
    api_ride_distance       = EXCLUDED.api_ride_distance,

    fonte_viagens           = 'api',
    api_sincronizado_em     = now(),
    updated_at              = now()
    -- Repare-se no que NÃO está aqui: ganhos_campanha, reembolsos_despesas,
    -- fonte_extras, csv_importado_em, raw_data, os IVA, os ganhos por hora, os
    -- descontos de comissão, nivel, pontuacao_motorista, taxa_aceitacao,
    -- utilizacao, taxas de finalização, classificacao_media, total_taxas,
    -- outras_taxas, reembolsos_passageiros, dinheiro_recebido, ganhos_liquidos,
    -- pagamento_previsto. São do CSV. E ganhos_brutos_total também não: é
    -- recalculado a seguir.
  RETURNING r.id INTO v_id;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  IF v_id IS NOT NULL THEN
    PERFORM public.bolt_resumo_recalcular_total(v_id);
  END IF;

  RETURN v_linhas;
END;
$$;

COMMENT ON FUNCTION public.bolt_resumo_merge_api(
  uuid, uuid, date, date, text, text, text, text, uuid, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  integer, integer, integer, numeric
) IS
  'Upsert de um resumo semanal Bolt do lado da API (getFleetOrders agregado por '
  'motorista/semana), respeitando a propriedade por campo: escreve só as parcelas '
  'de viagens e as colunas api_*, nunca toca em ganhos_campanha, reembolsos_despesas '
  'nem nas colunas exclusivas do CSV, e recalcula ganhos_brutos_total a partir dos '
  'valores já gravados na linha. Carimba fonte_viagens=''api'' e api_sincronizado_em. '
  'Chave: (integracao_id, periodo, chave_motorista), com chave_motorista derivada de '
  'identificador (driver_uuid) → email → nome normalizado. Devolve 1 (linha inserida '
  'ou actualizada) ou 0. Só service_role.';


-- ─── 6. RPC do lado do CSV ───────────────────────────────────────────────────
--
-- Espelho da anterior, para a importação manual do relatório do portal.
--
-- Recebe as colunas num jsonb (p_valores) em vez de 40 parâmetros: é
-- exactamente o objecto que a edge function bolt-import-csv já constrói a
-- partir do COLUMN_MAP. jsonb_populate_record só aproveita chaves que sejam
-- colunas da tabela e a lista explícita abaixo é a whitelist real — chaves
-- desconhecidas, ou chaves de colunas que o CSV não pode escrever (org_id,
-- fonte_*, api_*, ganhos_brutos_total), são ignoradas em silêncio.
--
-- Chave ausente do jsonb = "o ficheiro não trazia esta coluna" = não se escreve
-- (mantém-se o que lá está). Chave presente com 0 escreve 0, como deve ser.
--
-- REGRA DE RECÊNCIA, dentro do território das viagens: se a linha já tem
-- fonte_viagens = 'api' com api_sincronizado_em MAIS RECENTE do que este import,
-- as parcelas de viagens da API ficam como estão e o CSV grava só os extras.
-- p_importado_em existe precisamente para se poder reimportar um ficheiro
-- antigo sem ele se armar em novidade: passa-se a data a que o ficheiro se
-- refere e a API mais recente ganha.

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

  SELECT org_id INTO v_org
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
      ganhos_liquidos            = COALESCE(v_rec.ganhos_liquidos, ganhos_liquidos),
      pagamento_previsto         = COALESCE(v_rec.pagamento_previsto, pagamento_previsto),
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
  'Upsert de um resumo semanal Bolt do lado do CSV do portal. p_valores é o objecto '
  '{coluna_da_bd: valor} que a importação já constrói; chaves ausentes não são '
  'escritas e chaves que não sejam colunas escrevíveis pelo CSV são ignoradas. '
  'Escreve os extras (ganhos_campanha, reembolsos_despesas) e as colunas exclusivas '
  'do CSV, carimba fonte_extras=''csv'' e csv_importado_em. As parcelas de viagens só '
  'são escritas se o ficheiro as trouxer E a linha não tiver fonte_viagens=''api'' com '
  'api_sincronizado_em posterior a p_importado_em — nesse caso mantêm-se as da API. '
  'Recalcula sempre ganhos_brutos_total a partir do que ficou gravado. Devolve 1 ou 0. '
  'Só service_role.';


-- ─── 7. Permissões ───────────────────────────────────────────────────────────
-- As três funções são SECURITY DEFINER e bypassam RLS: só o backend
-- (service_role) as pode chamar. Um utilizador autenticado continua a mexer na
-- tabela pelas políticas normais.
--
-- ATENÇÃO ao REVOKE de anon/authenticated: neste projecto os default privileges
-- do schema public dão EXECUTE a anon e authenticated em TODAS as funções novas
-- (pg_default_acl: {postgres=X,anon=X,authenticated=X,service_role=X}). São
-- grants DIRECTOS, por isso `REVOKE … FROM PUBLIC` sozinho não os apaga — sem
-- as linhas abaixo, qualquer sessão autenticada podia chamar estas funções e
-- escrever no financeiro de outra organização (a função é SECURITY DEFINER, não
-- há RLS a travar; só a validação da org contra plataformas_configuracao).

REVOKE ALL ON FUNCTION public.bolt_resumo_recalcular_total(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bolt_resumo_merge_api(
  uuid, uuid, date, date, text, text, text, text, uuid, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  integer, integer, integer, numeric
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bolt_resumo_merge_csv(
  uuid, uuid, date, date, jsonb, text, uuid, boolean, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bolt_resumo_recalcular_total(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bolt_resumo_merge_api(
  uuid, uuid, date, date, text, text, text, text, uuid, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  integer, integer, integer, numeric
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bolt_resumo_merge_csv(
  uuid, uuid, date, date, jsonb, text, uuid, boolean, timestamptz
) TO service_role;


-- ============================================================================
-- VERIFICAÇÃO — correr depois de aplicar
-- ============================================================================
--
-- 1) Colunas novas (devem aparecer 17):
--
--   SELECT column_name, data_type, numeric_precision, numeric_scale
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name = 'bolt_resumos_semanais'
--      AND (column_name LIKE 'api\_%' OR column_name LIKE 'fonte\_%'
--           OR column_name IN ('api_sincronizado_em', 'csv_importado_em'))
--    ORDER BY column_name;
--
-- 2) Funções, permissões e search_path (devem aparecer 3, todas com
--    prosecdef = true e config {search_path=public}):
--
--   SELECT p.proname,
--          pg_get_function_identity_arguments(p.oid) AS argumentos,
--          p.prosecdef AS security_definer,
--          p.proconfig,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  AS pode_service_role,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS pode_authenticated,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS pode_anon
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('bolt_resumo_merge_api', 'bolt_resumo_merge_csv',
--                        'bolt_resumo_recalcular_total')
--    ORDER BY p.proname;
--
-- 3) Índices e constraints:
--
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'bolt_resumos_semanais'
--    ORDER BY indexname;
--
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.bolt_resumos_semanais'::regclass
--      AND conname LIKE 'bolt_resumos_fonte%';
--
-- 4) RLS intacta (as 3 políticas de sempre, nenhuma nova):
--
--   SELECT policyname, cmd, roles FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'bolt_resumos_semanais'
--    ORDER BY policyname;
--
-- 5) A identidade continua a fechar no histórico (deve devolver 0 linhas ou só
--    linhas antigas com resíduo conhecido):
--
--   SELECT periodo_inicio,
--          count(*) AS linhas,
--          round(sum(
--            COALESCE(ganhos_brutos_total, 0)
--            - COALESCE(ganhos_brutos_app, 0) - COALESCE(ganhos_brutos_dinheiro, 0)
--            - COALESCE(gorjetas, 0) - COALESCE(taxas_cancelamento, 0)
--            - COALESCE(ganhos_campanha, 0) - COALESCE(reembolsos_despesas, 0)
--          ), 2) AS residuo_eur
--     FROM public.bolt_resumos_semanais
--    GROUP BY periodo_inicio
--   HAVING round(sum(
--            COALESCE(ganhos_brutos_total, 0)
--            - COALESCE(ganhos_brutos_app, 0) - COALESCE(ganhos_brutos_dinheiro, 0)
--            - COALESCE(gorjetas, 0) - COALESCE(taxas_cancelamento, 0)
--            - COALESCE(ganhos_campanha, 0) - COALESCE(reembolsos_despesas, 0)
--          ), 2) <> 0
--    ORDER BY periodo_inicio DESC;
--
-- 6) ANTES do primeiro sync completo da API — confirmar que o driver_uuid da API
--    é mesmo o identificador_motorista do CSV. Correr o sync de UMA semana e UMA
--    integração e ver se completou linhas em vez de criar linhas novas:
--
--   SELECT fonte_viagens, fonte_extras, count(*)
--     FROM public.bolt_resumos_semanais
--    WHERE integracao_id = '1de54622-3cfe-4cf1-a1ae-d21bf4114df9'  -- Bolt Distancia
--      AND periodo_inicio = '2026-07-06'
--    GROUP BY 1, 2;
--
--   Esperado: linhas com fonte_viagens='api' E fonte_extras='csv' (a API
--   completou as do CSV). Se aparecerem linhas com fonte_extras IS NULL, a API
--   criou registos novos → o driver_uuid não bate com o identificador do CSV e
--   é preciso um mapa antes de continuar.
--
-- 7) Calibração da fórmula (semana de referência 2026-07-06, alvo 68.923,66 EUR):
--
--   SELECT round(sum(COALESCE(ganhos_brutos_app, 0) + COALESCE(gorjetas, 0)
--                  + COALESCE(taxas_cancelamento, 0)), 2) AS variante_actual,
--          round(sum(COALESCE(api_ride_price, 0)), 2)     AS so_ride_price,
--          round(sum(COALESCE(api_ride_price, 0) + COALESCE(api_booking_fee, 0)
--                  + COALESCE(api_toll_fee, 0)), 2)       AS ride_mais_taxas
--     FROM public.bolt_resumos_semanais
--    WHERE periodo_inicio = '2026-07-06' AND fonte_viagens = 'api';
-- ============================================================================
