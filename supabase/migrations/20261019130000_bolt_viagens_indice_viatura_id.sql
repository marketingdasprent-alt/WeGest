-- bolt_viagens (~1 GB) era a única tabela pesada com FK para viaturas sem índice:
-- apagar uma viatura obrigava a varrer a tabela toda à procura de referências
-- (DELETE FROM viaturas leu 328 990 blocos em duas chamadas). Parcial porque
-- viatura_id está NULL em todas as linhas: o índice fica quase vazio e serve na
-- mesma o "viatura_id = $1" da verificação da FK.
--
-- Em produção corre-se antes, sozinho no SQL Editor, para não bloquear escritas:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bolt_viagens_viatura_id
--     ON public.bolt_viagens (viatura_id) WHERE viatura_id IS NOT NULL;
-- Depois disso esta migração não faz nada.

CREATE INDEX IF NOT EXISTS idx_bolt_viagens_viatura_id
  ON public.bolt_viagens (viatura_id)
  WHERE viatura_id IS NOT NULL;
