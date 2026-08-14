-- ============================================================
-- Uber: o resumo semanal mantém-se sozinho, venha de onde vier
-- ============================================================
-- A tabela uber_resumos_semanais já existe (20260814160000), mas de nada serve
-- se alguém tiver de se lembrar de a escrever. Em vez de meter a chamada nos
-- dois importadores — o CSV (uber-import-reports) e a API (uber-full-sync) —
-- põe-se um gatilho na própria uber_transactions.
--
-- PORQUÊ ASSIM
-- Uma chamada em cada importador é uma coisa a esquecer: no dia em que aparecer
-- um terceiro caminho (webhook, outro relatório, uma correcção à mão), o resumo
-- fica para trás em silêncio e voltamos a ter dois números para o mesmo
-- dinheiro. Um gatilho sobre a tabela não se esquece.
--
-- A PRECEDÊNCIA CALCULA-SE, NÃO SE GUARDA
-- Para cada (integração, motorista, semana) o gatilho olha para as transacções
-- que lá estão e decide:
--   · se houver alguma linha da API, o balde é da API e só as linhas da API
--     entram na soma;
--   · senão, é do CSV.
-- É isto que impede a duplicação no dia em que a API oficial ligar: as linhas
-- por VIAGEM da API e a linha SEMANAL do CSV caem no mesmo balde, e o balde
-- fica só com as da API. Sem isto somavam-se as duas e a receita Uber duplicava
-- (938.644,87 EUR de bruto em produção).
--
-- Como se recalcula a partir do zero, é auto-curativo: apagar transacções,
-- corrigir valores ou reimportar acerta o resumo sozinho.
--
-- Gatilho ao nível do COMANDO (não da linha), com tabela de transição: uma
-- importação de 2.000 linhas faz UM recálculo dos baldes tocados, não 2.000.
-- ============================================================

-- 1) De onde veio cada transacção. Tudo o que lá está veio de CSV.
ALTER TABLE public.uber_transactions
  ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT 'csv';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.uber_transactions'::regclass AND conname = 'uber_transactions_fonte_check'
  ) THEN
    ALTER TABLE public.uber_transactions
      ADD CONSTRAINT uber_transactions_fonte_check CHECK (fonte IN ('api', 'csv'));
  END IF;
END $$;

COMMENT ON COLUMN public.uber_transactions.fonte IS
  'api = API oficial da Uber (uma linha por viagem); csv = relatório do portal '
  '(uma linha semanal por motorista). Decide a precedência no resumo semanal.';

CREATE INDEX IF NOT EXISTS idx_uber_transactions_balde
  ON public.uber_transactions (integracao_id, uber_driver_id, occurred_at);

-- 2) O recálculo dos baldes tocados.
CREATE OR REPLACE FUNCTION public.fn_uber_resumo_recalcular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.uber_resumos_semanais AS r (
    org_id, integracao_id, periodo, periodo_inicio, periodo_fim,
    chave_motorista, uber_driver_id, motorista_id,
    ganhos_brutos, ganhos_liquidos, comissoes, viagens,
    fonte, api_sincronizado_em, csv_importado_em
  )
  SELECT g.org_id, a.integracao_id,
         to_char(a.ini, 'YYYY-MM-DD') || ' a ' || to_char(a.ini + 6, 'YYYY-MM-DD'),
         a.ini, a.ini + 6,
         a.uber_driver_id, a.uber_driver_id, g.motorista_id,
         g.bruto, g.liquido, g.comissao, g.viagens,
         CASE WHEN f.tem_api THEN 'api' ELSE 'csv' END,
         CASE WHEN f.tem_api THEN now() END,
         CASE WHEN NOT f.tem_api THEN now() END
    FROM (
      SELECT DISTINCT integracao_id, uber_driver_id,
             date_trunc('week', occurred_at AT TIME ZONE 'UTC')::date AS ini
        FROM baldes_tocados
       WHERE uber_driver_id IS NOT NULL AND occurred_at IS NOT NULL
    ) a
    -- Quem manda neste balde?
    CROSS JOIN LATERAL (
      SELECT bool_or(t.fonte = 'api') AS tem_api
        FROM public.uber_transactions t
       WHERE t.integracao_id = a.integracao_id
         AND t.uber_driver_id = a.uber_driver_id
         AND date_trunc('week', t.occurred_at AT TIME ZONE 'UTC')::date = a.ini
    ) f
    -- Só as linhas de quem manda entram na soma.
    CROSS JOIN LATERAL (
      SELECT t.org_id,
             (array_agg(t.motorista_id) FILTER (WHERE t.motorista_id IS NOT NULL))[1] AS motorista_id,
             sum(COALESCE(t.gross_amount, 0))                  AS bruto,
             nullif(sum(COALESCE(t.net_amount, 0)), 0)         AS liquido,
             nullif(sum(COALESCE(t.commission_amount, 0)), 0)  AS comissao,
             count(*)::int                                     AS viagens
        FROM public.uber_transactions t
       WHERE t.integracao_id = a.integracao_id
         AND t.uber_driver_id = a.uber_driver_id
         AND date_trunc('week', t.occurred_at AT TIME ZONE 'UTC')::date = a.ini
         AND t.fonte = CASE WHEN f.tem_api THEN 'api' ELSE 'csv' END
       GROUP BY t.org_id
    ) g
  ON CONFLICT (integracao_id, periodo, chave_motorista) DO UPDATE SET
    motorista_id    = COALESCE(EXCLUDED.motorista_id, r.motorista_id),
    ganhos_brutos   = EXCLUDED.ganhos_brutos,
    ganhos_liquidos = EXCLUDED.ganhos_liquidos,
    comissoes       = EXCLUDED.comissoes,
    viagens         = EXCLUDED.viagens,
    fonte           = EXCLUDED.fonte,
    api_sincronizado_em = COALESCE(EXCLUDED.api_sincronizado_em, r.api_sincronizado_em),
    csv_importado_em    = COALESCE(EXCLUDED.csv_importado_em, r.csv_importado_em),
    updated_at      = now();

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_uber_resumo_recalcular() IS
  'Recalcula os baldes (integração, motorista, semana) tocados por um comando '
  'em uber_transactions. A API manda: havendo linhas da API no balde, só essas '
  'contam. Ver migração 20260814170000.';

-- 3) Os gatilhos. INSERT e UPDATE olham para as linhas novas; DELETE para as
--    que saíram — nos três casos o balde é recalculado do zero.
DROP TRIGGER IF EXISTS trg_uber_resumo_insert ON public.uber_transactions;
CREATE TRIGGER trg_uber_resumo_insert
  AFTER INSERT ON public.uber_transactions
  REFERENCING NEW TABLE AS baldes_tocados
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_uber_resumo_recalcular();

DROP TRIGGER IF EXISTS trg_uber_resumo_update ON public.uber_transactions;
CREATE TRIGGER trg_uber_resumo_update
  AFTER UPDATE ON public.uber_transactions
  REFERENCING NEW TABLE AS baldes_tocados
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_uber_resumo_recalcular();

DROP TRIGGER IF EXISTS trg_uber_resumo_delete ON public.uber_transactions;
CREATE TRIGGER trg_uber_resumo_delete
  AFTER DELETE ON public.uber_transactions
  REFERENCING OLD TABLE AS baldes_tocados
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_uber_resumo_recalcular();
