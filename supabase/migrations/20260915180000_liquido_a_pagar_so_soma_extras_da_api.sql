-- liquido_a_pagar só soma campanhas quando o líquido veio da API.
--
-- O QUE A 20260915170000 FEZ MAL
-- Criou liquido_a_pagar = ganhos_liquidos + ganhos_campanha + reembolsos,
-- sem olhar a quem escreveu o ganhos_liquidos. Isso está certo quando foi a
-- API (fonte_viagens = 'api'): ela devolve viagens e não conhece campanhas.
-- Está ERRADO quando foi o CSV: o líquido do extracto da Bolt é
-- bruto_total − total_taxas, e o bruto_total já traz a campanha lá dentro.
--
-- Apanhado uma hora depois de aplicada, na Bolt Lara (PREMIUM RIDE, em
-- password, líquido escrito pelo CSV):
--
--     João Fonseca   bruto 693,66 − taxas 136,79 = líquido 556,87 (com a
--                    campanha de 145 incluída)  →  liquido_a_pagar 701,87
--
-- Âmbito da duplicação: 1 350 linhas com fonte_viagens a NULL (upsert directo
-- antigo, sempre a partir do CSV) — 209 com campanha na Década Ousada
-- (2 728,12 EUR) e 16 na PREMIUM RIDE (360,43 EUR). As 5 100 linhas 'api'
-- estavam certas (18 637,43 EUR de campanhas a entrar bem).
--
-- A REGRA
--   fonte_viagens = 'api'          → + campanhas + reembolsos
--   fonte_viagens = 'csv' ou NULL  → nada a somar; já está no líquido
--
-- Uma expressão gerada não se altera no sítio: apaga-se e recria-se. É
-- derivada — não há dados a perder.

ALTER TABLE public.bolt_resumos_semanais DROP COLUMN IF EXISTS liquido_a_pagar;

ALTER TABLE public.bolt_resumos_semanais
  ADD COLUMN liquido_a_pagar numeric
  GENERATED ALWAYS AS (
    coalesce(ganhos_liquidos, 0)
    + CASE WHEN fonte_viagens = 'api'
           THEN coalesce(ganhos_campanha, 0) + coalesce(reembolsos_despesas, 0)
           ELSE 0
      END
  ) STORED;

COMMENT ON COLUMN public.bolt_resumos_semanais.liquido_a_pagar IS
  'O que se paga ao motorista. Se o líquido veio da API (fonte_viagens = api), soma-lhe as campanhas '
  'e reembolsos que só o CSV traz; se veio do CSV (csv ou NULL), o líquido já os inclui e não se soma nada. '
  'Sem gorjetas: já estão dentro de ganhos_liquidos. Gerada pela base — não se escreve. Ver src/config/bolt.ts.';

NOTIFY pgrst, 'reload schema';

-- Confirmação: gerada, e a expressão depende da fonte.
DO $verificar$
DECLARE
  v_gerada text;
  v_expr   text;
BEGIN
  SELECT is_generated, generation_expression INTO v_gerada, v_expr
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'bolt_resumos_semanais'
     AND column_name = 'liquido_a_pagar';

  IF v_gerada IS DISTINCT FROM 'ALWAYS' OR v_expr NOT ILIKE '%fonte_viagens%' THEN
    RAISE EXCEPTION 'liquido_a_pagar_so_soma_extras_da_api: coluna não ficou gerada com CASE sobre fonte_viagens (%, %).', v_gerada, v_expr;
  END IF;

  RAISE NOTICE 'liquido_a_pagar_so_soma_extras_da_api: coluna recriada; campanhas só somam quando fonte_viagens = api.';
END;
$verificar$;
