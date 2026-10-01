-- Só lê. Mostra o que a migração 20261001190000 e a 20261001180000 fizeram.
--   REABERTO  contratos que ganharam versão nova e voltam a cobrar desde 21/09
--   PARADO    contratos TVDE que continuam parados, e porquê
--   VERSAO    se a 180000 aplicada é a versão com a protecção contra pagar duas vezes
--   ID MOVIDO contas Uber/Bolt que a 180000 passou para outra ficha

select r.tipo, r.codigo, r.motorista, r.matricula, r.detalhe
  from (
    select 1 as ordem, 'REABERTO' as tipo, n.codigo, m.nome as motorista, v.matricula,
           'parado desde ' || to_char(a.data_fim at time zone 'Europe/Lisbon', 'DD/MM/YYYY') ||
           ' | versão ' || n.versao || ' desde ' || to_char(n.data_inicio at time zone 'UTC', 'DD/MM/YYYY') ||
           ' | ' || n.estado_operacional as detalhe
      from public.contratos_renting n
      join public.contratos_renting a on a.id = n.contrato_anterior_id
      left join public.viaturas v on v.id = n.viatura_id
      left join lateral (
        select mm.nome
          from public.contrato_condutores cc
          join public.motoristas_ativos mm on mm.id = cc.motorista_id
         where cc.contrato_id = n.id and cc.is_principal
         order by cc.data_inicio desc
         limit 1
      ) m on true
     where n.motivo_versao like 'Reaberto: estava em curso sem cobrar%'

    union all

    select 2, 'PARADO', c.codigo, m.nome, v.matricula,
           'parado desde ' || to_char(c.data_fim at time zone 'Europe/Lisbon', 'DD/MM/YYYY') || ' | ' ||
           coalesce(public.motivo_tvde_parado_nao_reabre(c.id, '2026-09-20 12:00:00+00'),
                    'DEVIA TER REABERTO E NÃO REABRIU')
      from public.contratos_renting c
      left join public.viaturas v on v.id = c.viatura_id
      left join lateral (
        select mm.nome
          from public.contrato_condutores cc
          join public.motoristas_ativos mm on mm.id = cc.motorista_id
         where cc.contrato_id = c.id and cc.is_principal
         order by cc.data_inicio desc
         limit 1
      ) m on true
     where c.regime = 'tvde'
       and c.estado_operacional = 'em_curso'
       and c.deleted_at is null
       and c.substituido_em is null
       and c.data_fim is not null

    union all

    select 3, 'VERSAO', null, null, null,
           case when exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                              and p.proname = 'semana_ja_liquidada')
                then 'OK: 180000 com protecção contra pagar duas vezes'
                else 'ATENÇÃO: 180000 antiga, sem a protecção das semanas já pagas' end

    union all

    select 4, 'ID MOVIDO', null, mo.nome, null,
           i.plataforma || ' ' || i.identificador
      from public.motorista_plataforma_identidades i
      join public.motoristas_ativos mo on mo.id = i.motorista_id
     where i.origem = 'ultima_ficha'
  ) r
 order by r.ordem, r.codigo, r.motorista;
