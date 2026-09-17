-- ============================================================
-- Movimentos Repsol duplicados: identificar e guardar antes de remover
-- ============================================================
-- O QUE ESTAVA MAL
--
-- Desde 2026-07-22 o importador da Repsol gerava o `transaction_id` a partir
-- de um hash de TODAS as colunas do ficheiro. O upsert deduplica por
-- (integracao_id, transaction_id), portanto bastava a Repsol exportar o mesmo
-- período com um formato diferente para a reimportação entrar a dobrar.
--
-- E exporta. Em produção coexistem o export completo (45 colunas, `VALOR:
-- "100,00"`) e um reduzido (8 colunas, `VALOR: "100.00 €"`), e o nome do posto
-- vem truncado a comprimentos diferentes em cada um ("E.S. LEIRIA SUL" vs
-- "E.S. LEIRIA SUL QT TABORD"). Qualquer destas diferenças muda o hash.
--
-- Resultado a 2026-09-17: 354 movimentos a dobrar, 15 719,04 €, em 89 cartões.
-- O grosso veio das reimportações de 08/09+15/09 (261 pares), 10/08+25/08 (51)
-- e 25/08+02/09 (36). Quatro são de março/abril, do formato antigo sem hora.
--
-- `ID. OPERAÇÃO` não servia como chave alternativa: em 86 dos 87 pares que o
-- traziam dos dois lados, a Repsol deu um id diferente à MESMA abastecida.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--
-- Só identifica e guarda. A remoção fica na migração seguinte, para que a
-- cópia exista e esteja conferida antes de se apagar seja o que for.
--
-- A chave que identifica a abastecida é cartão + instante + valor + litros.
-- Nos exports antigos, sem hora, junta-se o posto truncado a 15 caracteres —
-- o mesmo cartão abastecia duas vezes no mesmo dia em postos diferentes.
--
-- Fica a linha mais rica em `raw_data` (o export de 45 colunas manda sobre o
-- de 8) e, em empate, a mais antiga. `mantido_id` aponta para essa.
--
-- O importador foi corrigido em paralelo (repsol-import-csv, `transactionKey`).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.repsol_duplicados_removidos_20260917
  (LIKE public.repsol_transacoes INCLUDING DEFAULTS);

ALTER TABLE public.repsol_duplicados_removidos_20260917
  ADD COLUMN IF NOT EXISTS removido_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS mantido_id uuid;

ALTER TABLE public.repsol_duplicados_removidos_20260917 ENABLE ROW LEVEL SECURITY;

INSERT INTO public.repsol_duplicados_removidos_20260917
SELECT t.*, now(), z.mantido_id
FROM (
  SELECT id, first_value(id) OVER w AS mantido_id, row_number() OVER w AS rn
  FROM (
    SELECT id, raw_data,
      CASE WHEN transaction_date::time <> '00:00:00'
        THEN 'repsol-' || coalesce(card_number, '') || '-' ||
             to_char(transaction_date, 'YYYYMMDDHH24MISS') || '-' ||
             coalesce(round(amount, 2)::text, '') || '-' ||
             coalesce(round(quantity, 2)::text, '')
        ELSE 'repsol-' || coalesce(card_number, '') || '-' ||
             to_char(transaction_date, 'YYYYMMDDHH24MISS') || '-' ||
             coalesce(round(amount, 2)::text, '') || '-' ||
             coalesce(round(quantity, 2)::text, '') || '-' ||
             left(lower(regexp_replace(coalesce(station_name, ''), '\W', '', 'g')), 15)
      END AS chave
    FROM public.repsol_transacoes
  ) k
  WINDOW w AS (
    PARTITION BY chave
    ORDER BY (SELECT count(*) FROM jsonb_object_keys(raw_data)) DESC, id
  )
) z
JOIN public.repsol_transacoes t ON t.id = z.id
WHERE z.rn > 1;

COMMENT ON TABLE public.repsol_duplicados_removidos_20260917 IS
  'Movimentos Repsol duplicados por reimportação, retirados a 2026-09-17. A causa foi o transaction_id ser um hash de todas as colunas do export, que a Repsol muda entre semanas. mantido_id aponta para a linha que ficou.';
