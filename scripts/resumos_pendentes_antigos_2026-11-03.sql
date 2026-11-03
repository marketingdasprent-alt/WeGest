-- Decisão de 03/11/2026: as contas só valem desde a semana de 26/10 (a primeira
-- gerada no WeGest). Tudo o que ficou pendente antes disso deixa de contar.
--
-- Marca-se como PAGO (visto no Relatório de Pagamento) e não como cancelado:
-- movimentos_ja_no_resumo só esconde do saldo os acertos que o resumo já somou
-- se o resumo estiver pendente ou pago. Cancelar o resumo fazia reaparecer no
-- saldo esses acertos soltos, e o motorista ficava com outro saldo falso.
--
-- Fica de fora a semana de 26/10 e o que não é resumo (multas, danos, caução).
-- Reversível: apagar a linha de relatorio_pagamento_pagos reabre o movimento.

-- 1) ENSAIO: o que vai ser marcado, por sinal (débito = o motorista devia).
select f.tipo, count(*) as semanas, round(sum(f.valor), 2) as total
  from motorista_liquido_semanal l
  join motorista_financeiro f on f.liquido_semanal_id = l.id and f.status = 'pendente'
 where l.semana_inicio < '2026-10-26'
 group by f.tipo;

-- 2) APLICAR (descomentar depois de rever o ensaio)
-- insert into relatorio_pagamento_pagos (org_id, motorista_id, semana_inicio)
-- select l.org_id, l.motorista_id, l.semana_inicio
--   from motorista_liquido_semanal l
--   join motorista_financeiro f on f.liquido_semanal_id = l.id and f.status = 'pendente'
--  where l.semana_inicio < '2026-10-26'
-- on conflict (org_id, motorista_id, semana_inicio) do nothing;
