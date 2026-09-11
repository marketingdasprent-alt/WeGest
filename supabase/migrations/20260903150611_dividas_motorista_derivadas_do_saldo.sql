-- A dívida deixa de ser um retrato tirado à mão e passa a ser o saldo
-- pendente do motorista. Enquanto a soma de todos os movimentos por liquidar
-- for negativa, o motorista está em dívida — não há nada a inserir, nada que
-- fique desactualizado, e um motorista nunca aparece duas vezes.
--
-- A tabela dividas_motorista deixa de listar dívidas em aberto e passa a
-- guardar LIQUIDAÇÕES: uma linha por cada vez que alguém marcou a dívida como
-- paga, com o retrato do que foi liquidado.

ALTER TABLE public.motorista_financeiro
  ADD CONSTRAINT motorista_financeiro_divida_id_fkey
  FOREIGN KEY (divida_id) REFERENCES public.dividas_motorista(id) ON DELETE SET NULL;

-- Um movimento por liquidar, visto do lado da dívida. Os três valores são os
-- mesmos que o popup calculava: o saldo, e as duas partes dele que se
-- costumam querer explicar (danos e caução).
CREATE VIEW public.dividas_motorista_abertas
WITH (security_invoker = true) AS
SELECT
  m.id                                        AS motorista_id,
  m.nome                                      AS motorista_nome,
  m.org_id                                    AS org_id,
  round(sum(CASE f.tipo WHEN 'credito' THEN f.valor ELSE -f.valor END), 2)  AS saldo,
  -- Danos: só reparações por liquidar; um crédito de reparação é um acerto e
  -- abate. Nunca desce abaixo de zero — não existe "dano negativo".
  greatest(round(sum(
    CASE WHEN f.categoria = 'reparacao' AND f.tipo = 'debito'  THEN  f.valor
         WHEN f.categoria = 'reparacao' AND f.tipo = 'credito' THEN -f.valor
         ELSE 0 END), 2), 0)                  AS valor_danos,
  -- Caução: crédito soma (entregou), débito subtrai (foi usada/devolvida).
  round(sum(
    CASE WHEN f.categoria = 'caucao' AND f.tipo = 'credito' THEN  f.valor
         WHEN f.categoria = 'caucao' AND f.tipo = 'debito'  THEN -f.valor
         ELSE 0 END), 2)                      AS valor_caucao,
  min(f.data_movimento)                       AS periodo_inicio,
  max(f.data_movimento)                       AS periodo_fim
FROM public.motoristas_ativos m
JOIN public.motorista_financeiro f ON f.motorista_id = m.id
WHERE f.status = 'pendente'
GROUP BY m.id, m.nome, m.org_id
HAVING sum(CASE f.tipo WHEN 'credito' THEN f.valor ELSE -f.valor END) < 0;

COMMENT ON VIEW public.dividas_motorista_abertas IS
  'Motoristas com saldo pendente negativo. É a lista de dívidas por cobrar: derivada, nunca inserida.';
