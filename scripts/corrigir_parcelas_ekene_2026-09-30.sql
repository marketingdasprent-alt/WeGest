-- Ekene Nchekwube Muodum — acordo "Para brisas BO-29-DG" em 24 parcelas semanais
-- Correr À MÃO no SQL Editor, bloco a bloco. Idempotente.
--
-- O problema: as 24 parcelas (51,57 €) foram gravadas todas com data 21/09/2026.
-- O resumo desconta as reparações pela data do movimento, por isso a semana
-- 21–27/09 levou o para-brisas inteiro (1237,62 €) e fechou em −774,30 €.
-- A correcção: a parcela n passa a 21/09 + (n−1) semanas (24/24 = 01/03/2027).
-- Depois disto, voltar a FECHAR a semana 21–27/09 no ecrã de Contas/Resumo.

-- ─── 0) Ver o que vai mudar ──────────────────────────────────────────────────
SELECT descricao, valor, status, data_pagamento,
       data_movimento AS data_actual,
       DATE '2026-09-21'
         + (substring(descricao FROM '\((\d+)/24\)$')::int - 1) * 7 AS data_nova
FROM public.motorista_financeiro
WHERE motorista_id = '79d54083-2bf0-4f3e-9205-ce48d43fa86b'
  AND categoria = 'reparacao'
  AND descricao LIKE 'Acordo de pagamento: Para brisas BO-29-DG (%/24)'
ORDER BY substring(descricao FROM '\((\d+)/24\)$')::int;
-- Esperado: 24 linhas, data_actual toda 2026-09-21, data_nova de 2026-09-21 a 2027-03-01.

-- ─── 1) Datas semanais ───────────────────────────────────────────────────────
BEGIN;

UPDATE public.motorista_financeiro
SET data_movimento = DATE '2026-09-21'
      + (substring(descricao FROM '\((\d+)/24\)$')::int - 1) * 7
WHERE motorista_id = '79d54083-2bf0-4f3e-9205-ce48d43fa86b'
  AND categoria = 'reparacao'
  AND descricao LIKE 'Acordo de pagamento: Para brisas BO-29-DG (%/24)';
-- Esperado: UPDATE 24

-- ─── 2) O pagamento de 25/09 é da 1.ª parcela, não da 15.ª ───────────────────
-- Só mexe se ainda estiver como hoje (1/24 pendente, 15/24 paga).
UPDATE public.motorista_financeiro p1
SET status = 'pago',
    data_pagamento = p15.data_pagamento
FROM public.motorista_financeiro p15
WHERE p1.motorista_id = '79d54083-2bf0-4f3e-9205-ce48d43fa86b'
  AND p1.descricao = 'Acordo de pagamento: Para brisas BO-29-DG (1/24)'
  AND p1.status = 'pendente'
  AND p15.motorista_id = p1.motorista_id
  AND p15.descricao = 'Acordo de pagamento: Para brisas BO-29-DG (15/24)'
  AND p15.status = 'pago';
-- Esperado: UPDATE 1 (ou 0 se já foi corrido)

UPDATE public.motorista_financeiro
SET status = 'pendente',
    data_pagamento = NULL
WHERE motorista_id = '79d54083-2bf0-4f3e-9205-ce48d43fa86b'
  AND descricao = 'Acordo de pagamento: Para brisas BO-29-DG (15/24)'
  AND status = 'pago'
  AND EXISTS (
    SELECT 1 FROM public.motorista_financeiro
    WHERE motorista_id = '79d54083-2bf0-4f3e-9205-ce48d43fa86b'
      AND descricao = 'Acordo de pagamento: Para brisas BO-29-DG (1/24)'
      AND status = 'pago'
  );
-- Esperado: UPDATE 1 (ou 0 se já foi corrido)

COMMIT;

-- ─── 3) Conferir ─────────────────────────────────────────────────────────────
SELECT data_movimento, descricao, valor, status, data_pagamento
FROM public.motorista_financeiro
WHERE motorista_id = '79d54083-2bf0-4f3e-9205-ce48d43fa86b'
  AND categoria = 'reparacao'
ORDER BY data_movimento;
-- Esperado: uma parcela por semana; só a 1/24 (21/09) paga.
--
-- Depois: fechar outra vez a semana 21–27/09. Reparações deve dar 51,57 € e o
-- líquido 638,32 − 175,00 − 51,57 = +411,75 € (a favor do motorista).
