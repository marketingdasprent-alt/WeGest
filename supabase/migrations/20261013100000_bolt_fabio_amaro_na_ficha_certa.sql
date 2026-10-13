-- Correcção de dados: a conta Bolt "Fabio Silva" (telefone 910439357, email
-- famaro2004@gmail.com, 546 viagens no BL-14-BI) é do Fabio Amaro da Silva e
-- estava ligada à ficha do Fabio Xavier da Silva Gomes Queirós pela
-- comparação de nomes do sync-driver-ids (corrigida no PR #366).
-- Semanas já pagas ao Queirós ficam onde estão; não se lança crédito nenhum.
-- Sem a conta ou sem uma ficha única do Fabio Amaro (ex.: base do CI), não faz nada.
do $$
declare
  v_org   constant uuid := '11111111-1111-1111-1111-111111111111';
  v_conta constant text := '84c46c23-f676-4bcd-ab8f-f0d2c037a4d2';
  v_fabio uuid;
  v_n     int;
  v_res   text;
begin
  select count(*), (array_agg(m.id))[1] into v_n, v_fabio
    from public.motoristas_ativos m
   where m.org_id = v_org
     and m.nome ilike 'Fabio Amaro%'
     and (right(regexp_replace(coalesce(m.telefone, ''), '\D', '', 'g'), 9) = '910439357'
          or lower(trim(m.email)) = 'famaro2004@gmail.com');
  if v_n <> 1 or not exists (
    select 1 from public.bolt_drivers d where d.org_id = v_org and d.driver_uuid = v_conta
  ) then
    raise notice 'Fabio Amaro: nada a fazer (fichas encontradas: %).', v_n;
    return;
  end if;

  create table if not exists private.desfazer_bolt_fabio_2026_10_13 (
    tabela text, id uuid, antes jsonb, gravado_em timestamptz default now());

  insert into private.desfazer_bolt_fabio_2026_10_13 (tabela, id, antes)
  select 'motoristas_ativos', m.id, jsonb_build_object('bolt_id', m.bolt_id)
    from public.motoristas_ativos m where m.org_id = v_org and (m.bolt_id = v_conta or m.id = v_fabio)
  union all
  select 'motorista_plataforma_identidades', i.id, to_jsonb(i)
    from public.motorista_plataforma_identidades i
   where i.org_id = v_org and i.plataforma = 'bolt' and i.identificador = v_conta
  union all
  select 'bolt_resumos_semanais', b.id, jsonb_build_object('motorista_id', b.motorista_id)
    from public.bolt_resumos_semanais b where b.org_id = v_org and b.identificador_motorista = v_conta
  union all
  select 'bolt_drivers', d.id, jsonb_build_object('motorista_id', d.motorista_id)
    from public.bolt_drivers d where d.org_id = v_org and d.driver_uuid = v_conta
  union all
  select 'bolt_viagens', v.id, jsonb_build_object('motorista_id', v.motorista_id)
    from public.bolt_viagens v where v.org_id = v_org and v.driver_uuid = v_conta
  union all
  select 'motorista_liquido_semanal', l.id, to_jsonb(l)
    from public.motorista_liquido_semanal l
   where l.semana_inicio >= '2026-08-17'
     and l.motorista_id in (select b.motorista_id from public.bolt_resumos_semanais b
                             where b.org_id = v_org and b.identificador_motorista = v_conta)
  union all
  select 'motorista_financeiro', f.id, to_jsonb(f)
    from public.motorista_financeiro f join public.motorista_liquido_semanal l on l.id = f.liquido_semanal_id
   where l.semana_inicio >= '2026-08-17'
     and l.motorista_id in (select b.motorista_id from public.bolt_resumos_semanais b
                             where b.org_id = v_org and b.identificador_motorista = v_conta);

  perform public.mover_identidade_plataforma(v_org, 'bolt', v_conta, v_fabio, true, '2026-08-17');
  update public.bolt_viagens set motorista_id = v_fabio
   where org_id = v_org and driver_uuid = v_conta and motorista_id is distinct from v_fabio;

  select string_agg(b.periodo_inicio || '=' || b.ganhos_liquidos || ' ' || coalesce(m.nome, '-'), ' | ' order by b.periodo_inicio)
    into v_res
    from public.bolt_resumos_semanais b left join public.motoristas_ativos m on m.id = b.motorista_id
   where b.org_id = v_org and b.identificador_motorista = v_conta;
  raise notice 'Fabio Amaro: %', v_res;
end $$;
