-- Duas parcelas do mesmo plano ("Descrição (n/N)") nunca na mesma semana.
--
-- A 2026-09-17 as 24 parcelas do acordo do Ekene entraram directamente na
-- base, todas com data de 21/09, e o fecho dessa semana descontou 1.237,62 €
-- de uma vez em vez de 51,57 €. O ecrã já gera uma parcela por semana; isto
-- garante o mesmo para qualquer outro caminho (editor de tabelas, scripts).
--
-- Plano = mesmo motorista, tipo, descrição sem o "(n/N)" e mesmo N.
-- Parcelas canceladas não contam. Idempotente.

CREATE UNIQUE INDEX IF NOT EXISTS motorista_financeiro_uma_parcela_por_semana
  ON public.motorista_financeiro (
    motorista_id,
    tipo,
    (regexp_replace(descricao, ' \(\d+/\d+\)\s*$', '')),
    (substring(descricao FROM '/(\d+)\)\s*$')),
    (date_trunc('week', data_movimento::timestamp))
  )
  WHERE status IS DISTINCT FROM 'cancelado'
    AND descricao ~ ' \(\d+/\d+\)\s*$';

COMMENT ON INDEX public.motorista_financeiro_uma_parcela_por_semana IS
  'Cada parcela "(n/N)" de um plano cai numa semana diferente — senão o fecho dessa semana desconta várias de uma vez.';

NOTIFY pgrst, 'reload schema';
