-- ============================================================
-- API do site: juntar as duas correcções de api_viaturas_livres
-- ============================================================
-- 20261023130000 (reservada/em uso sem registo fica fora) e 20261028120000/
-- 20261029090000 (contrato em curso e 'em uso' à mão) nasceram em paralelo e a
-- última apagava a primeira. Ficam as duas: na dúvida, a viatura sai do site.
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
     -- Reservada ou em uso exige um registo actual que o explique; sem ele, o
     -- estado ganha aos registos e a viatura não se vende em data nenhuma.
     and (coalesce(v.status, 'disponivel') not in ('reservada', 'em_uso')
          or exists (
            select 1 from public.contratos_renting c
             where c.viatura_id = v.id and c.deleted_at is null and c.substituido_em is null
               and c.estado_operacional::text in ('agendado', 'em_curso')
               and (c.data_fim is null or c.data_fim > now()))
          or exists (
            select 1 from public.reservas r
             where r.viatura_id = v.id and r.deleted_at is null
               and r.estado::text in ('pendente', 'confirmada', 'em_curso')
               and coalesce(r.data_fim, 'infinity'::timestamptz) > now())
          or exists (
            select 1 from public.motorista_viaturas mv
             where mv.viatura_id = v.id and mv.status = 'ativo'
               and (mv.data_fim is null or mv.data_fim >= current_date))
          or exists (
            select 1 from public.movimentos m
             where m.viatura_id = v.id and m.estado::text in ('planeado', 'a_decorrer')
               and coalesce(m.data_chegada, 'infinity'::timestamptz) > now()))
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
     -- 'em_uso' só com contrato em curso ou motorista hoje: um contrato agendado ou
     -- uma reserva não põem a viatura na rua, por isso não há data de regresso.
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

-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated. Mesmos grants de 20261002110001.
revoke execute on function public.api_viaturas_livres(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.api_viaturas_livres(uuid, timestamptz, timestamptz) to service_role;

NOTIFY pgrst, 'reload schema';
