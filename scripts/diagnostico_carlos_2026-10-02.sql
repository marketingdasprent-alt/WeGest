-- Só lê. Os dois Carlos da Década Ousada: fichas, contas Uber/Bolt e o que o
-- sistema atribuiu a cada um nas últimas 6 semanas.
with f as (
  select m.id, m.nome, m.status_ativo, m.bolt_id, m.uber_uuid, m.created_at, m.org_id
    from public.motoristas_ativos m
   where m.org_id = (select id from public.organizacoes where nome ilike 'Década Ousada%' limit 1)
     and (m.nome ilike '%Carlos Henrique%Oliveira%' or m.nome ilike '%Carlos Moreira%Oliveira%')
)
select r.tipo, r.quem, r.plataforma, r.identificador, r.detalhe, r.valor
  from (
    select 1 as ordem, 'FICHA' as tipo, f.nome as quem, null::text as plataforma,
           null::text as identificador,
           'activo=' || coalesce(f.status_ativo::text, 'null') || ' | bolt_id=' || coalesce(f.bolt_id, '-')
             || ' | uber_uuid=' || coalesce(f.uber_uuid, '-') || ' | criada ' || f.created_at::date as detalhe,
           null::numeric as valor
      from f
    union all
    select 2, 'IDENTIDADE', m.nome, i.plataforma, i.identificador,
           'origem=' || i.origem || ' | desde ' || i.created_at::date, null
      from public.motorista_plataforma_identidades i
      join public.motoristas_ativos m on m.id = i.motorista_id
     where i.motorista_id in (select id from f)
        or i.identificador in (select bolt_id from f where bolt_id is not null
                               union select uber_uuid from f where uber_uuid is not null)
    union all
    select 3, 'BOLT', coalesce(m.nome, '(sem ficha)'), 'bolt', b.identificador_motorista,
           b.periodo_inicio || ' | nome no ficheiro: ' || coalesce(b.motorista_nome, '?'),
           b.ganhos_liquidos
      from public.bolt_resumos_semanais b
      left join public.motoristas_ativos m on m.id = b.motorista_id
     where b.periodo_inicio >= current_date - 42
       and (b.motorista_id in (select id from f)
            or b.identificador_motorista in (select bolt_id from f where bolt_id is not null)
            or b.motorista_nome ilike '%Carlos%Oliveira%')
    union all
    select 4, 'UBER', coalesce(m.nome, '(sem ficha)'), 'uber', u.uber_driver_id,
           u.periodo_inicio || ' | nome no ficheiro: ' || coalesce(u.motorista_nome, '?'),
           u.ganhos_brutos
      from public.uber_resumos_semanais u
      left join public.motoristas_ativos m on m.id = u.motorista_id
     where u.periodo_inicio >= current_date - 42
       and (u.motorista_id in (select id from f)
            or u.uber_driver_id in (select uber_uuid from f where uber_uuid is not null)
            or u.motorista_nome ilike '%Carlos%Oliveira%')
  ) r
 order by r.ordem, r.detalhe;
