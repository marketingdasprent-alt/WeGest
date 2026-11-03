-- Resumos positivos antigos que ficaram pendentes (nunca foi marcado "Pago").
-- O pagamento automático (20261103110000) só vale daqui para a frente.
--
-- 1) ENSAIO: corre só este SELECT e revê a lista. Quem tem o líquido gravado SEM
--    Bolt (gestor sem financeiro_recibos) aparece com bolt_na_semana = 0 mas
--    líquido > 0: NÃO marcar essas, corrigir primeiro.
-- 2) APLICAR: só depois de rever. Marca como pago o que nunca foi pago, até à
--    semana passada. Reversível: apagar a linha de relatorio_pagamento_pagos volta
--    o movimento a pendente (sincronizar_pagamento_resumo).

-- 1) ENSAIO
select l.motorista_id, m.nome, l.semana_inicio, l.liquido,
       coalesce((select sum(b.liquido_a_pagar) from bolt_resumos_semanais b
                  where b.motorista_id = l.motorista_id
                    and b.periodo_inicio <= l.semana_fim
                    and coalesce(b.periodo_fim, b.periodo_inicio) >= l.semana_inicio), 0) as bolt_na_semana
  from motorista_liquido_semanal l
  join motorista_financeiro f on f.liquido_semanal_id = l.id and f.status = 'pendente'
  join motoristas_ativos m on m.id = l.motorista_id
 where l.liquido > 0
   and l.semana_fim < date_trunc('week', current_date)::date
 order by m.nome, l.semana_inicio;

-- 2) APLICAR (descomentar depois de rever o ensaio)
-- insert into relatorio_pagamento_pagos (org_id, motorista_id, semana_inicio)
-- select l.org_id, l.motorista_id, l.semana_inicio
--   from motorista_liquido_semanal l
--   join motorista_financeiro f on f.liquido_semanal_id = l.id and f.status = 'pendente'
--  where l.liquido > 0
--    and l.semana_fim < date_trunc('week', current_date)::date
-- on conflict (org_id, motorista_id, semana_inicio) do nothing;
