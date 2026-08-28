-- ============================================================================
-- bolt_viagens: parcelas de OrderPriceData, empresa e fonte
-- ============================================================================
--
-- PORQUÊ
-- A edge function bolt-sync-semana grava uma linha por viagem vinda de
-- getFleetOrders. A tabela só tem três colunas de dinheiro (total_price,
-- driver_earnings, commission) e a API devolve NOVE parcelas por viagem
-- (OrderPriceData). Como ainda não está provado se ride_price já engloba
-- booking_fee e toll_fee, guardar só o derivado obrigaria a voltar a chamar a
-- API para responder a essa pergunta — e a API só serve janelas limitadas.
--
-- Faltava também saber de que EMPRESA da Bolt veio cada viagem (uma credencial
-- pode cobrir várias) e de que FONTE veio a linha (API ou, um dia, CSV).
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ
-- Não toca em total_price nem em driver_earnings. São colunas legadas, lidas
-- por ContasResumoTab (.gt('driver_earnings', 0)) e por MotoristaRecibosSection.
-- Enquanto BOLT_FONTE_FINANCEIRA (src/config/bolt.ts) for 'csv', a API tem de as
-- deixar a NULL, senão a receita Bolt aparece a dobrar: uma vez pelo CSV e outra
-- pelas viagens. O valor da API vive em net_earnings e ride_price.
--
-- Idempotente e aditiva: só ADD COLUMN IF NOT EXISTS e CREATE INDEX IF NOT
-- EXISTS. Não apaga linhas nem colunas e pode correr as vezes que forem
-- precisas. Independente das migrações 20260804120000 e 20260804140000 (mexe
-- noutra tabela), mas na prática só faz sentido com a função a correr.
-- ============================================================================

-- ─── 1. Empresa e fonte ──────────────────────────────────────────────────────

ALTER TABLE public.bolt_viagens
  ADD COLUMN IF NOT EXISTS company_id bigint,
  ADD COLUMN IF NOT EXISTS fonte      text;

COMMENT ON COLUMN public.bolt_viagens.company_id IS
  'Empresa da Bolt (company_id de getFleetOrders) de onde veio a viagem. Uma credencial '
  'Fleet Integration pode cobrir várias empresas; sem esta coluna não era possível separá-las.';

COMMENT ON COLUMN public.bolt_viagens.fonte IS
  'Origem da linha: ''api'' (bolt-sync-semana, getFleetOrders). NULL nas linhas antigas '
  'escritas pela função bolt-sync legada.';

-- ─── 2. As nove parcelas de OrderPriceData ───────────────────────────────────
-- A spec da Bolt define exactamente estas nove e mais nenhuma. commission já
-- existia na tabela e é reaproveitada.

ALTER TABLE public.bolt_viagens
  ADD COLUMN IF NOT EXISTS ride_price        numeric(12,2),
  ADD COLUMN IF NOT EXISTS booking_fee       numeric(12,2),
  ADD COLUMN IF NOT EXISTS toll_fee          numeric(12,2),
  ADD COLUMN IF NOT EXISTS cancellation_fee  numeric(12,2),
  ADD COLUMN IF NOT EXISTS tip               numeric(12,2),
  ADD COLUMN IF NOT EXISTS net_earnings      numeric(12,2),
  ADD COLUMN IF NOT EXISTS cash_discount     numeric(12,2),
  ADD COLUMN IF NOT EXISTS in_app_discount   numeric(12,2),
  ADD COLUMN IF NOT EXISTS ride_distance     numeric(12,2);

COMMENT ON COLUMN public.bolt_viagens.ride_price IS
  'OrderPriceData.ride_price em bruto. NÃO está confirmado se já engloba booking_fee e '
  'toll_fee — é por isso que todas as parcelas são guardadas em separado.';
COMMENT ON COLUMN public.bolt_viagens.booking_fee IS 'OrderPriceData.booking_fee em bruto.';
COMMENT ON COLUMN public.bolt_viagens.toll_fee IS 'OrderPriceData.toll_fee em bruto (portagens).';
COMMENT ON COLUMN public.bolt_viagens.cancellation_fee IS 'OrderPriceData.cancellation_fee em bruto.';
COMMENT ON COLUMN public.bolt_viagens.tip IS 'OrderPriceData.tip em bruto (gorjeta do passageiro).';
COMMENT ON COLUMN public.bolt_viagens.net_earnings IS
  'OrderPriceData.net_earnings em bruto. É o equivalente da API ao driver_earnings legado — '
  'mas o financeiro NÃO o lê enquanto BOLT_FONTE_FINANCEIRA for ''csv''.';
COMMENT ON COLUMN public.bolt_viagens.cash_discount IS 'OrderPriceData.cash_discount em bruto.';
COMMENT ON COLUMN public.bolt_viagens.in_app_discount IS 'OrderPriceData.in_app_discount em bruto.';
COMMENT ON COLUMN public.bolt_viagens.ride_distance IS
  'FleetOrder.ride_distance SEM conversão. A unidade não está confirmada (provavelmente '
  'metros); a conversão para km é feita na agregação, não aqui.';

COMMENT ON COLUMN public.bolt_viagens.total_price IS
  'LEGADO. Deixado a NULL pela sincronização por API de propósito: é lido pelos ecrãs '
  'financeiros e preenchê-lo duplicaria a receita Bolt enquanto a fonte for o CSV. '
  'O valor equivalente da API está em ride_price.';
COMMENT ON COLUMN public.bolt_viagens.driver_earnings IS
  'LEGADO. Deixado a NULL pela sincronização por API de propósito: ContasResumoTab filtra '
  'por .gt(''driver_earnings'', 0) e MotoristaRecibosSection soma-o. O valor equivalente da '
  'API está em net_earnings. Ver src/config/bolt.ts (BOLT_FONTE_FINANCEIRA).';

-- ─── 3. Índices ──────────────────────────────────────────────────────────────
-- A conferência dos totais faz-se sempre por integração e por semana; e o
-- ContasResumoTab filtra por payment_confirmed_timestamp, que não tinha índice
-- nenhum (só order_created_timestamp tinha).

CREATE INDEX IF NOT EXISTS idx_bolt_viagens_integracao_criada
  ON public.bolt_viagens (integracao_id, order_created_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bolt_viagens_payment_confirmed
  ON public.bolt_viagens (payment_confirmed_timestamp);


-- ============================================================================
-- CONFERÊNCIA (correr à mão depois de aplicar e de sincronizar uma semana)
-- ============================================================================
--
-- 1) A semana chegou toda e as parcelas estão nas colunas?
--
--   SELECT company_id, fonte, count(*) AS viagens,
--          count(*) FILTER (WHERE ride_price IS NULL) AS sem_preco,
--          round(sum(ride_price), 2)   AS ride_price,
--          round(sum(booking_fee), 2)  AS booking_fee,
--          round(sum(toll_fee), 2)     AS toll_fee,
--          round(sum(tip), 2)          AS gorjetas,
--          round(sum(cancellation_fee), 2) AS cancelamentos
--     FROM public.bolt_viagens
--    WHERE integracao_id = '<integracao>'
--      AND order_created_timestamp >= '2026-07-06 00:00:00+01'
--      AND order_created_timestamp <  '2026-07-13 00:00:00+01'
--    GROUP BY 1, 2;
--
-- 2) Qual das quatro variantes bate certo com a semana de referência
--    (2026-07-06, alvo app+gorjetas+cancelamentos = 68 923,66 EUR)?
--
--   SELECT round(sum(ride_price) + sum(tip) + sum(cancellation_fee), 2) AS v1,
--          round(sum(ride_price) + sum(booking_fee) + sum(toll_fee)
--                + sum(tip) + sum(cancellation_fee), 2)                 AS v2,
--          round(sum(ride_price) + sum(in_app_discount)
--                + sum(tip) + sum(cancellation_fee), 2)                 AS v3,
--          round(sum(ride_price) + sum(booking_fee) + sum(toll_fee)
--                + sum(in_app_discount) + sum(tip) + sum(cancellation_fee), 2) AS v4
--     FROM public.bolt_viagens
--    WHERE integracao_id = '<integracao>'
--      AND order_created_timestamp >= '2026-07-06 00:00:00+01'
--      AND order_created_timestamp <  '2026-07-13 00:00:00+01';
--
--   (A mesma resposta vem no campo `variantes` do JSON devolvido pela função,
--    sem ser preciso ter as viagens gravadas.)
--
-- 3) Confirmar que o financeiro NÃO foi contaminado — tem de dar 0:
--
--   SELECT count(*) FROM public.bolt_viagens
--    WHERE fonte = 'api' AND (driver_earnings IS NOT NULL OR total_price IS NOT NULL);
-- ============================================================================
