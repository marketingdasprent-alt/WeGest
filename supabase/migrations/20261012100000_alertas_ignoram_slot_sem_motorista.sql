-- Slot sem motorista aparece como "Inativo" no ecrã (deriveViaturaEstado),
-- mas o status na BD fica disponivel/em_uso e o cron continuava a alertar.
-- Exclui-o com o mesmo critério de atribuição activa do associacaoViaturaAtiva().

CREATE OR REPLACE FUNCTION "public"."emit_expiry_events"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    v.org_id,
    'viatura.seguro_expirando',
    'viaturas',
    v.id,
    jsonb_build_object('seguro_validade', v.seguro_validade, 'matricula', v.matricula),
    'cron'
  from public.viaturas v
  where v.seguro_validade is not null
    and v.seguro_validade <= current_date + 15
    and (v.is_vendida is null or v.is_vendida = false)
    and coalesce(v.status, 'disponivel') <> 'inativo'
    and not (
      coalesce(v.is_slot, false)
      and not exists (
        select 1 from public.motorista_viaturas mv
        where mv.viatura_id = v.id
          and mv.status = 'ativo'
          and (mv.data_fim is null or mv.data_fim >= current_date)
      )
    )
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'viaturas'
        and e.entity_id = v.id
        and e.event_type = 'viatura.seguro_expirando'
        and e.processed_at is null
    );

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    v.org_id,
    'viatura.inspecao_expirando',
    'viaturas',
    v.id,
    jsonb_build_object('inspecao_validade', v.inspecao_validade, 'matricula', v.matricula),
    'cron'
  from public.viaturas v
  where v.inspecao_validade is not null
    and v.inspecao_validade <= current_date + 15
    and (v.is_vendida is null or v.is_vendida = false)
    and coalesce(v.status, 'disponivel') <> 'inativo'
    and not (
      coalesce(v.is_slot, false)
      and not exists (
        select 1 from public.motorista_viaturas mv
        where mv.viatura_id = v.id
          and mv.status = 'ativo'
          and (mv.data_fim is null or mv.data_fim >= current_date)
      )
    )
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'viaturas'
        and e.entity_id = v.id
        and e.event_type = 'viatura.inspecao_expirando'
        and e.processed_at is null
    );

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    v.org_id,
    'viatura.extintor_expirando',
    'viaturas',
    v.id,
    jsonb_build_object('extintor_validade', v.extintor_validade, 'matricula', v.matricula),
    'cron'
  from public.viaturas v
  where v.extintor_validade is not null
    and v.extintor_validade <= current_date + 15
    and (v.is_vendida is null or v.is_vendida = false)
    and coalesce(v.status, 'disponivel') <> 'inativo'
    and not (
      coalesce(v.is_slot, false)
      and not exists (
        select 1 from public.motorista_viaturas mv
        where mv.viatura_id = v.id
          and mv.status = 'ativo'
          and (mv.data_fim is null or mv.data_fim >= current_date)
      )
    )
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'viaturas'
        and e.entity_id = v.id
        and e.event_type = 'viatura.extintor_expirando'
        and e.processed_at is null
    );

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    x.org_id,
    'viatura.iuc_a_pagar',
    'viaturas',
    x.id,
    jsonb_build_object('matricula', x.matricula, 'marca', x.marca, 'modelo', x.modelo, 'proxima_data_iuc', x.proxima_data_iuc),
    'cron'
  from (
    select
      v.id, v.org_id, v.matricula, v.marca, v.modelo,
      (v.data_matricula + make_interval(years => extract(year from age(current_date, v.data_matricula))::int + 1))::date as proxima_data_iuc
    from public.viaturas v
    where v.data_matricula is not null
      and (v.is_vendida is null or v.is_vendida = false)
      and coalesce(v.status, 'disponivel') <> 'inativo'
      and not (
        coalesce(v.is_slot, false)
        and not exists (
          select 1 from public.motorista_viaturas mv
          where mv.viatura_id = v.id
            and mv.status = 'ativo'
            and (mv.data_fim is null or mv.data_fim >= current_date)
        )
      )
  ) x
  where x.proxima_data_iuc <= current_date + 15
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'viaturas'
        and e.entity_id = x.id
        and e.event_type = 'viatura.iuc_a_pagar'
        and e.processed_at is null
    );

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    v.org_id,
    'viatura.manutencao_preventiva_expirando',
    'viaturas',
    v.id,
    jsonb_build_object(
      'matricula', v.matricula,
      'proxima_manutencao_data', v.proxima_manutencao_data,
      'proxima_manutencao_km', v.proxima_manutencao_km,
      'km_atual', v.km_atual
    ),
    'cron'
  from public.viaturas v
  where (v.is_vendida is null or v.is_vendida = false)
    and coalesce(v.status, 'disponivel') <> 'inativo'
    and not (
      coalesce(v.is_slot, false)
      and not exists (
        select 1 from public.motorista_viaturas mv
        where mv.viatura_id = v.id
          and mv.status = 'ativo'
          and (mv.data_fim is null or mv.data_fim >= current_date)
      )
    )
    and (
      (v.proxima_manutencao_data is not null and v.proxima_manutencao_data <= current_date + 15)
      or (
        v.proxima_manutencao_km is not null
        and v.km_atual is not null
        and v.km_atual >= v.proxima_manutencao_km - 500
      )
    )
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'viaturas'
        and e.entity_id = v.id
        and e.event_type = 'viatura.manutencao_preventiva_expirando'
        and e.processed_at is null
    );

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    m.org_id,
    'motorista.carta_expirando',
    'motoristas_ativos',
    m.id,
    jsonb_build_object('carta_validade', m.carta_validade, 'nome', m.nome),
    'cron'
  from public.motoristas_ativos m
  where m.carta_validade is not null
    and m.carta_validade <= current_date + 15
    and coalesce(m.status_ativo, true) = true
    and m.org_id is not null
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'motoristas_ativos'
        and e.entity_id = m.id
        and e.event_type = 'motorista.carta_expirando'
        and e.processed_at is null
    );

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    m.org_id,
    'motorista.licenca_tvde_expirando',
    'motoristas_ativos',
    m.id,
    jsonb_build_object('licenca_tvde_validade', m.licenca_tvde_validade, 'nome', m.nome),
    'cron'
  from public.motoristas_ativos m
  where m.licenca_tvde_validade is not null
    and m.licenca_tvde_validade <= current_date + 15
    and coalesce(m.status_ativo, true) = true
    and m.org_id is not null
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'motoristas_ativos'
        and e.entity_id = m.id
        and e.event_type = 'motorista.licenca_tvde_expirando'
        and e.processed_at is null
    );
end;
$$;

NOTIFY pgrst, 'reload schema';
