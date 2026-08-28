-- ============================================================
-- Normaliza as linhas infladas e faz tábua rasa do backlog repetido
-- ============================================================
-- Só é seguro fazer isto DEPOIS de:
--   (a) fn_notificacoes_agrupar() deixar de fundir linhas com evento_id
--       (senão o ciclo de 5 minutos volta a inflar);
--   (b) process_domain_events() suprimir a re-emissão com aviso em aberto
--       (senão o backlog reconstrói-se em 30 dias).
-- Ambas aplicadas e testadas antes desta.
--
-- PORQUE RESOLVER E NÃO APAGAR
-- `resolvida = true` é reversível e mantém o rasto. A retenção
-- (limpar_notificacoes_antigas, 04:00) trata do resto daqui a 30 dias.
--
-- PORQUE ISTO NÃO PERDE OS DOCUMENTOS CADUCADOS
-- emit_expiry_events() filtra por `validade <= current_date + 15`, SEM limite
-- inferior: um seguro caducado há dois meses continua a ser emitido. No dia
-- seguinte às 08:00 os 150 seguros e 112 inspeções caducados voltam — uma vez,
-- com dados frescos — e a supressão impede a repetição diária. Verificado no
-- corpo da função antes de aplicar.
--
-- O QUE NÃO SE TOCA
--   sistema_job_falhou (46)            falhas técnicas; ninguém as re-emite
--   sistema_limite_email_atingido (5)  idem
--   viatura_disponivel (9)             vem do cron da lista de espera, com
--                                      guard próprio por evento_id
--
-- RESULTADO MEDIDO: 3811 -> 60 pendentes. 3751 resolvidas. 7497 linhas
-- intactas (nada apagado). Por pessoa: de ~250 para 1 a 7.

-- ------------------------------------------------------------
-- 1. Normalizar as 6 linhas infladas (agrupadas até 577)
-- ------------------------------------------------------------
-- São repetições do MESMO aviso (mesmo link), acumuladas pelo ciclo já travado.
-- Mantém-se um item por link distinto: nada de real se perde.
with expandido as (
  select n.id, i.item, i.ord,
         row_number() over (partition by n.id, i.item->>'link' order by i.ord) as rn
  from public.notificacoes n
  cross join lateral jsonb_array_elements(coalesce(n.itens, '[]'::jsonb)) with ordinality as i(item, ord)
  where n.tipo = 'viatura_disponivel' and not n.resolvida and n.agrupadas > 1
), compactado as (
  select id, jsonb_agg(item order by ord) as itens_novos
  from expandido where rn = 1 group by id
)
update public.notificacoes n
set itens = c.itens_novos,
    agrupadas = greatest(1, jsonb_array_length(c.itens_novos))
from compactado c
where n.id = c.id;

-- ------------------------------------------------------------
-- 2. Tábua rasa do backlog gerado pela re-emissão diária
-- ------------------------------------------------------------
update public.notificacoes
set resolvida = true,
    resolvida_em = now(),
    resolvida_por_nome = 'Sistema — limpeza estrutural 2026-08-26'
where not resolvida
  and tipo not in ('sistema_job_falhou', 'sistema_limite_email_atingido', 'viatura_disponivel');

-- ------------------------------------------------------------
-- 3. Asserções — aborta tudo se alguma coisa não bater certo
-- ------------------------------------------------------------
do $$
declare
  v_restantes integer;
  v_infladas  integer;
  v_preservadas integer;
begin
  select count(*) into v_restantes from public.notificacoes where not resolvida;
  select count(*) into v_infladas  from public.notificacoes
    where not resolvida and tipo = 'viatura_disponivel' and agrupadas > 10;
  select count(*) into v_preservadas from public.notificacoes
    where not resolvida and tipo in ('sistema_job_falhou', 'sistema_limite_email_atingido', 'viatura_disponivel');

  if v_infladas > 0 then
    raise exception 'Abortado: ainda existem % linhas viatura_disponivel com agrupadas > 10.', v_infladas;
  end if;

  if v_restantes <> v_preservadas then
    raise exception 'Abortado: sobraram % não-resolvidas mas só % deviam ser preservadas.', v_restantes, v_preservadas;
  end if;

  raise notice 'Limpeza concluída: % não-resolvidas restantes (todas preservadas de propósito).', v_restantes;
end $$;
