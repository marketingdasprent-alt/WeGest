-- Só lê. Contratos TVDE reabertos à mão que ficaram sem a semana de 21/09.
select c.codigo, m.nome as motorista, v.matricula,
       a.data_fim::date as anterior_acabou, c.data_inicio::date as nova_comeca
  from public.contratos_renting c
  join public.contratos_renting a on a.id = c.contrato_anterior_id
  left join public.viaturas v on v.id = c.viatura_id
  left join lateral (select mm.nome from public.contrato_condutores cc
                       join public.motoristas_ativos mm on mm.id = cc.motorista_id
                      where cc.contrato_id = c.id and cc.is_principal limit 1) m on true
 where c.regime = 'tvde' and c.estado_operacional = 'em_curso'
   and c.deleted_at is null and c.substituido_em is null
   and c.data_fim is null and c.data_inicio > timestamptz '2026-09-20 12:00+00'
   and a.data_fim < timestamptz '2026-09-20 12:00+00'
 order by c.codigo;
