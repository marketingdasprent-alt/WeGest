-- A conta da própria frota deixa de entrar nos resumos semanais da Uber.
--
-- O QUE APARECIA
-- Nos totais semanais da Década Ousada:
--
--     2026-07-27:  10 014 EUR        2026-08-17:  -1 488 EUR
--     2026-08-03:     463 EUR        2026-08-24:    -409 EUR
--
-- Semanas inteiras com o bruto negativo, entre semanas normais de ~10 000 EUR.
--
-- PORQUÊ
-- Exactamente uma linha por integração e por semana vinha entre -3 696 e
-- -9 623 EUR, com todas as outras entre 104 e 1 036 EUR. Essa linha é a
-- empresa:
--
--     Década Ousada, Lda.   11 semanas   -67 183 EUR
--     URBANGO Lda            8 semanas   -65 834 EUR
--     PREMIUM RIDE, LDA     10 semanas   -42 729 EUR
--
-- É o pagamento semanal da Uber à frota — dinheiro que sai da Uber para o
-- banco da empresa, não ganhos de ninguém. A migração 20260911140000 já tinha
-- identificado o problema e criado `uber_drivers.is_conta_frota`, mas fechou-o
-- só no ecrã dos motoristas sem ficha. O `fn_uber_resumo_recalcular` continuou
-- a criar uma linha de resumo por cada uber_driver_id que aparecesse nas
-- transacções, a conta da frota incluída.
--
-- O QUE MUDA
-- O resumo passa a saltar quem está marcado `is_conta_frota`. A ordem dos
-- gatilhos garante que a marca já lá está: `trg_uber_marcar_conta_frota` é
-- row-level AFTER e corre antes do `trg_uber_resumo_*`, que é statement-level.
--
-- Verificado em produção antes de escrever esta migração, em leitura:
-- 2 976 baldes (integração × condutor × semana), 32 excluídos pelo filtro,
-- 2 944 ficam. Os 32 são as 3 empresas e nenhum motorista real.
--
-- O QUE NÃO SE APAGA
-- As `uber_transactions` ficam intactas — continuam a ser precisas para
-- reconciliar o que a Uber pagou à empresa. É o mesmo princípio da 20260911140000.
-- Só se apagam as linhas DERIVADAS do resumo, que o gatilho reconstrói a
-- partir das transacções sempre que preciso.

CREATE OR REPLACE FUNCTION public.fn_uber_resumo_recalcular()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.uber_resumos_semanais AS r (
    org_id, integracao_id, periodo, periodo_inicio, periodo_fim,
    chave_motorista, uber_driver_id, motorista_id, motorista_nome,
    ganhos_brutos, ganhos_liquidos, comissoes, gorjetas, viagens,
    fonte, api_sincronizado_em, csv_importado_em
  )
  SELECT g.org_id, a.integracao_id,
         to_char(a.ini, 'YYYY-MM-DD') || ' a ' || to_char(a.ini + 6, 'YYYY-MM-DD'),
         a.ini, a.ini + 6,
         a.uber_driver_id, a.uber_driver_id, g.motorista_id, g.nome,
         g.bruto, g.liquido, g.comissao, g.gorjeta, g.viagens,
         CASE WHEN f.tem_api THEN 'api' ELSE 'csv' END,
         CASE WHEN f.tem_api THEN now() END,
         CASE WHEN NOT f.tem_api THEN now() END
    FROM (
      SELECT DISTINCT b.integracao_id, b.uber_driver_id,
             date_trunc('week', b.occurred_at AT TIME ZONE 'UTC')::date AS ini
        FROM baldes_tocados b
       WHERE b.uber_driver_id IS NOT NULL AND b.occurred_at IS NOT NULL
         -- A conta da própria frota não é um motorista: a linha dela é a
         -- transferência bancária da Uber para a empresa, com o valor
         -- negativo e sem tarifa nenhuma. Marcada por
         -- trg_uber_marcar_conta_frota (row-level), que corre antes deste
         -- gatilho (statement-level).
         AND NOT EXISTS (
           SELECT 1
             FROM public.uber_drivers d
            WHERE d.integracao_id = b.integracao_id
              AND d.uber_driver_id = b.uber_driver_id
              AND d.is_conta_frota
         )
    ) a
    CROSS JOIN LATERAL (
      SELECT bool_or(t.fonte = 'api') AS tem_api
        FROM public.uber_transactions t
       WHERE t.integracao_id = a.integracao_id
         AND t.uber_driver_id = a.uber_driver_id
         AND date_trunc('week', t.occurred_at AT TIME ZONE 'UTC')::date = a.ini
    ) f
    CROSS JOIN LATERAL (
      SELECT t.org_id,
             (array_agg(t.motorista_id) FILTER (WHERE t.motorista_id IS NOT NULL))[1] AS motorista_id,
             (array_agg(btrim(
                coalesce(t.raw_transaction->'csv_row'->>'Nome próprio do motorista','') || ' ' ||
                coalesce(t.raw_transaction->'csv_row'->>'Apelido do motorista','')
             )) FILTER (WHERE btrim(
                coalesce(t.raw_transaction->'csv_row'->>'Nome próprio do motorista','') || ' ' ||
                coalesce(t.raw_transaction->'csv_row'->>'Apelido do motorista','')
             ) <> ''))[1]                                     AS nome,
             sum(COALESCE(t.gross_amount, 0))                  AS bruto,
             nullif(sum(COALESCE(t.net_amount, 0)), 0)         AS liquido,
             nullif(sum(COALESCE(t.commission_amount, 0)), 0)  AS comissao,
             COALESCE(sum(gr.valor), 0)                        AS gorjeta,
             count(*)::int                                     AS viagens
        FROM public.uber_transactions t
        LEFT JOIN LATERAL (
          -- A coluna da gratificacao muda de nome entre relatorios; procura-se
          -- pela palavra, como o ecra fazia.
          SELECT sum(replace(kv.value, ',', '.')::numeric) AS valor
            FROM jsonb_each_text(COALESCE(t.raw_transaction->'csv_row', '{}'::jsonb)) kv
           WHERE (kv.key ILIKE '%Gratifica%')
             AND kv.value ~ '^-?[0-9]+([.,][0-9]+)?$'
        ) gr ON true
       WHERE t.integracao_id = a.integracao_id
         AND t.uber_driver_id = a.uber_driver_id
         AND date_trunc('week', t.occurred_at AT TIME ZONE 'UTC')::date = a.ini
         AND t.fonte = CASE WHEN f.tem_api THEN 'api' ELSE 'csv' END
       GROUP BY t.org_id
    ) g
  ON CONFLICT (integracao_id, periodo, chave_motorista) DO UPDATE SET
    motorista_id    = COALESCE(EXCLUDED.motorista_id, r.motorista_id),
    motorista_nome  = COALESCE(EXCLUDED.motorista_nome, r.motorista_nome),
    ganhos_brutos   = EXCLUDED.ganhos_brutos,
    ganhos_liquidos = EXCLUDED.ganhos_liquidos,
    comissoes       = EXCLUDED.comissoes,
    gorjetas        = EXCLUDED.gorjetas,
    viagens         = EXCLUDED.viagens,
    fonte           = EXCLUDED.fonte,
    api_sincronizado_em = COALESCE(EXCLUDED.api_sincronizado_em, r.api_sincronizado_em),
    csv_importado_em    = COALESCE(EXCLUDED.csv_importado_em, r.csv_importado_em),
    updated_at      = now();

  RETURN NULL;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- Limpeza das linhas já criadas — só a Década Ousada, por decisão explícita.
-- As outras organizações ficam como estão; o gatilho corrigido já impede
-- que nasçam linhas novas em qualquer uma delas.
-- ─────────────────────────────────────────────────────────────────────────
DO $limpeza$
DECLARE
  v_org       CONSTANT uuid := '11111111-1111-1111-1111-111111111111';  -- Década Ousada
  v_apagadas  integer;
  v_com_dono  integer;
BEGIN
  -- Guarda: uma linha de conta da frota ligada a um motorista seria sinal de
  -- que alguém carregou em "Associar" antes de isto fechar. Nesse caso não se
  -- apaga — avisa-se, para ser vista à mão.
  SELECT count(*) INTO v_com_dono
    FROM public.uber_resumos_semanais r
    JOIN public.uber_drivers d
      ON d.integracao_id = r.integracao_id
     AND d.uber_driver_id = r.uber_driver_id
   WHERE d.is_conta_frota
     AND r.org_id = v_org
     AND r.motorista_id IS NOT NULL;

  IF v_com_dono > 0 THEN
    RAISE WARNING
      'conta_frota_fora_dos_resumos_uber: % linha(s) de conta da frota já estão ligadas a um motorista e NÃO foram apagadas. Ver à mão.',
      v_com_dono;
  END IF;

  DELETE FROM public.uber_resumos_semanais r
   USING public.uber_drivers d
   WHERE d.integracao_id = r.integracao_id
     AND d.uber_driver_id = r.uber_driver_id
     AND d.is_conta_frota
     AND r.org_id = v_org
     AND r.motorista_id IS NULL;

  GET DIAGNOSTICS v_apagadas = ROW_COUNT;
  RAISE NOTICE 'conta_frota_fora_dos_resumos_uber: % linha(s) de resumo apagadas (esperadas 22).', v_apagadas;
END;
$limpeza$;
