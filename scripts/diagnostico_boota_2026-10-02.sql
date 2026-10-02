-- Só lê. Todos os contratos da viatura BN-04-MN e do Boota Singh.
select c.codigo, c.versao, c.estado_operacional, c.substituido_em is not null as substituido,
       c.deleted_at is not null as apagado, c.regime,
       c.data_inicio::date as inicio, c.data_fim::date as fim, c.proxima_renovacao_em::date as renovar_a,
       c.tarifa_id is not null as tem_tarifa,
       (select t.preco_semana from public.renting_tarifas t where t.id = c.tarifa_id) as tarifa_semana,
       (select pm.preco_semana from public.renting_tarifa_precos_modelo pm
         where pm.tarifa_id = c.tarifa_id and pm.modelo_id = v.modelo_id) as preco_do_modelo,
       v.matricula,
       (select string_agg(m.nome || case when cc.is_principal then ' (principal)' else '' end
                          || ' desde ' || cc.data_inicio::date
                          || coalesce(' até ' || cc.data_fim::date, ''), '; ')
          from public.contrato_condutores cc
          join public.motoristas_ativos m on m.id = cc.motorista_id
         where cc.contrato_id = c.id) as condutores,
       left(c.motivo_versao, 60) as motivo
  from public.contratos_renting c
  left join public.viaturas v on v.id = c.viatura_id
 where v.matricula = 'BN-04-MN'
    or exists (select 1 from public.contrato_condutores cc
                 join public.motoristas_ativos m on m.id = cc.motorista_id
                where cc.contrato_id = c.id and m.nome ilike 'BOOTA SINGH%')
 order by c.codigo, c.versao;
