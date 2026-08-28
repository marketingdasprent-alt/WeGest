-- Motor de Automação — Fase 2, Sub-projeto 2: primeira fonte real de
-- domain_events. Scan diário (mesma janela de 15 dias e mesmo horário
-- 08:00 já usados por send-alertas-expiracoes) sobre viaturas
-- (seguro/IPO) e motoristas_ativos (carta/licença TVDE).
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-emissao-eventos.md.

create or replace function public.emit_expiry_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Seguro a expirar (≤15 dias), excluindo viaturas vendidas/inativas.
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
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'viaturas'
        and e.entity_id = v.id
        and e.event_type = 'viatura.seguro_expirando'
        and e.processed_at is null
    );

  -- Inspeção periódica (IPO) a expirar (≤15 dias).
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
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'viaturas'
        and e.entity_id = v.id
        and e.event_type = 'viatura.inspecao_expirando'
        and e.processed_at is null
    );

  -- Carta de condução do motorista a expirar (≤15 dias).
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    m.org_id,
    'motorista.carta_expirando',
    'motoristas_ativos',
    m.id,
    jsonb_build_object('carta_validade', m.carta_validade),
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

  -- Licença TVDE do motorista a expirar (≤15 dias).
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    m.org_id,
    'motorista.licenca_tvde_expirando',
    'motoristas_ativos',
    m.id,
    jsonb_build_object('licenca_tvde_validade', m.licenca_tvde_validade),
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

revoke all on function public.emit_expiry_events() from public, anon, authenticated;
grant execute on function public.emit_expiry_events() to service_role;

select cron.schedule(
  'automation-emit-expiry-events-diario',
  '0 8 * * *',
  $$select public.emit_expiry_events()$$
);
