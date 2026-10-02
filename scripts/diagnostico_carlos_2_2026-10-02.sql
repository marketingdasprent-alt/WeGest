-- Só lê. Os três Carlos: fichas, e o que já foi fechado ou pago em cada semana.
with f as (
  select m.id, m.nome, m.status_ativo, m.bolt_id, m.uber_uuid
    from public.motoristas_ativos m
   where m.org_id = (select id from public.organizacoes where nome ilike 'Década Ousada%' limit 1)
     and (m.nome ilike '%Carlos Henrique%Oliveira%' or m.nome ilike '%Carlos Moreira%Oliveira%'
          or m.nome ilike '%Carlos Eduardo Rodrigues%')
)
select r.tipo, r.quem, r.detalhe
  from (
    select 1 as ordem, 'FICHA' as tipo, f.nome as quem,
           'activo=' || coalesce(f.status_ativo::text, 'null') || ' | bolt_id=' || coalesce(f.bolt_id, '-')
             || ' | uber_uuid=' || coalesce(f.uber_uuid, '-') as detalhe
      from f
    union all
    select 2, f.nome,
           'semana ' || l.semana_inicio || ' | líquido ' || l.liquido || ' | movimento '
             || coalesce((select string_agg(mf.status, ',') from public.motorista_financeiro mf
                           where mf.liquido_semanal_id = l.id), 'nenhum')
             || case when exists (select 1 from public.relatorio_pagamento_pagos p
                                   where p.motorista_id = l.motorista_id and p.semana_inicio = l.semana_inicio)
                     then ' | marcada paga no relatório' else '' end
      from public.motorista_liquido_semanal l
      join f on f.id = l.motorista_id
     where l.semana_inicio >= current_date - 56
  ) r
 order by r.ordem, r.quem, r.detalhe;
