-- ============================================================
-- API do site: aluguer de longa duração só liberta a viatura ao fechar
-- ============================================================
-- O data_fim de um contrato mensal é só o fim do período: o cliente renova e a
-- viatura não volta. O site vendia-a a partir desse dia (29-10-2026: clientes
-- a chegar para carrinhas que não havia). Resto igual a 20261028120000.
-- ============================================================

create or replace function public.api_viaturas_livres(
  p_org_id uuid, p_inicio timestamptz, p_fim timestamptz)
returns table (viatura_id uuid, modelo_id uuid)
language sql stable security definer set search_path = public as $$
  select v.id, v.modelo_id
    from public.viaturas_com_disponibilidade(p_inicio, p_fim, p_org_id) d
    join public.viaturas v on v.id = d.viatura_id and v.org_id = p_org_id
   where d.disponivel
     and v.modelo_id is not null
     and coalesce(v.status, 'disponivel') not in ('inativo', 'manutencao', 'em_recolha')
     -- Vendida antes do fim do período também não conta: não chega ao fim do aluguer.
     and (v.data_venda is null or v.data_venda > (p_fim at time zone 'Europe/Lisbon')::date)
     -- Sem filtro por mv.org_id: uma atribuição com org_id divergente continua a
     -- bloquear o carro. O isolamento vem de v.org_id = p_org_id.
     and not exists (
       select 1 from public.motorista_viaturas mv
        where mv.viatura_id = v.id
          and mv.status = 'ativo'
          and (mv.data_inicio is null or mv.data_inicio <= (p_fim at time zone 'Europe/Lisbon')::date)
          and (mv.data_fim is null or mv.data_fim >= (p_inicio at time zone 'Europe/Lisbon')::date))
     -- Contrato em curso = viatura com o cliente agora, digam o que disserem as datas.
     -- Longa duração renova-se: só o fecho a liberta. Curto só fica livre se acabar
     -- antes do início pedido e ainda não tiver vencido.
     and not exists (
       select 1 from public.contratos_renting c
        where c.org_id = p_org_id
          and c.viatura_id = v.id
          and c.deleted_at is null
          and c.substituido_em is null
          and c.estado_operacional = 'em_curso'
          and (c.is_longa_duracao or c.data_fim is null or c.data_fim > p_inicio or c.data_fim <= now()))
     -- 'em_uso' sem contrato em curso nem motorista hoje foi posto à mão: não há
     -- data de regresso, por isso não se vende em período nenhum.
     and not (
       v.status = 'em_uso'
       and not exists (
         select 1 from public.contratos_renting c
          where c.org_id = p_org_id
            and c.viatura_id = v.id
            and c.deleted_at is null
            and c.substituido_em is null
            and c.estado_operacional = 'em_curso')
       and not exists (
         select 1 from public.motorista_viaturas mv
          where mv.viatura_id = v.id
            and mv.status = 'ativo'
            and (mv.data_inicio is null or mv.data_inicio <= (now() at time zone 'Europe/Lisbon')::date)
            and (mv.data_fim is null or mv.data_fim >= (now() at time zone 'Europe/Lisbon')::date)));
$$;

NOTIFY pgrst, 'reload schema';
