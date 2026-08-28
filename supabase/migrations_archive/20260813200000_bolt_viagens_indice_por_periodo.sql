-- ============================================================
-- Índice que a fase «agregar» precisava
-- ============================================================
-- A fase 'agregar' lê uma semana de bolt_viagens filtrando por
-- (integracao_id, intervalo de order_created_timestamp). Não havia índice
-- que servisse esse filtro.
--
-- O planeador usava (integracao_id, order_reference) e descartava 128.647
-- linhas pelo filtro de data para devolver 1000. Medido com EXPLAIN ANALYZE:
--
--   Execution Time: 38.548 ms   ← trinta e oito SEGUNDOS, por página
--   Rows Removed by Filter: 128.647
--
-- Estourava o statement timeout e a agregação nunca chegava ao fim.
-- Com o índice certo, a mesma consulta:
--
--   Execution Time: 143 ms      ← 270× mais rápido
--
-- A ordem do índice (…, order_created_timestamp, order_reference) é também a
-- ordem da paginação, por isso a ordenação sai de graça.
-- ============================================================

CREATE INDEX IF NOT EXISTS bolt_viagens_integracao_periodo
  ON public.bolt_viagens (integracao_id, order_created_timestamp, order_reference);

COMMENT ON INDEX public.bolt_viagens_integracao_periodo IS
  'Serve a leitura da semana na fase agregar do bolt-sync-semana. Sem ele a '
  'consulta levava 38 s por página de 1000; com ele, 143 ms.';
