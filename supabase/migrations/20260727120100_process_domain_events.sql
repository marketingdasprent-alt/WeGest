-- Motor de Automação — Fase 2, Sub-projeto 3: Rule Engine. Casa
-- domain_events não processados contra automation_rules ativas,
-- avalia a condição, respeita o cooldown, e cria (ou regista porque
-- não) um automation_run. Marca sempre o evento como processado.
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-rule-engine.md.

create or replace function public.process_domain_events(p_max integer default 50)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_rule record;
  v_condicao jsonb;
  v_matches boolean;
  v_cooldown_ok boolean;
begin
  for v_event in
    select * from public.domain_events
    where processed_at is null
    order by occurred_at asc
    limit p_max
  loop
    for v_rule in
      select * from public.automation_rules
      where ativo = true
        and org_id = v_event.org_id
        and event_type = v_event.event_type
    loop
      v_matches := true;

      if jsonb_typeof(v_rule.condicoes) = 'array' then
        for v_condicao in select * from jsonb_array_elements(v_rule.condicoes)
        loop
          if v_condicao->>'operador' = '=' then
            if (v_event.payload->>(v_condicao->>'campo')) is distinct from (v_condicao->>'valor') then
              v_matches := false;
            end if;
          elsif v_condicao->>'operador' = '!=' then
            if (v_event.payload->>(v_condicao->>'campo')) is not distinct from (v_condicao->>'valor') then
              v_matches := false;
            end if;
          end if;
        end loop;
      end if;

      if not v_matches then
        insert into public.automation_logs (rule_id, org_id, evento, detalhe)
        values (v_rule.id, v_rule.org_id, 'condicao_nao_satisfeita', jsonb_build_object('event_id', v_event.id));
        continue;
      end if;

      v_cooldown_ok := true;
      if v_rule.cooldown_minutos > 0 then
        select not exists (
          select 1
          from public.automation_runs r
          where r.rule_id = v_rule.id
            and r.entity_table = v_event.entity_table
            and r.entity_id = v_event.entity_id
            and r.created_at > now() - (v_rule.cooldown_minutos * interval '1 minute')
        ) into v_cooldown_ok;
      end if;

      if not v_cooldown_ok then
        insert into public.automation_logs (rule_id, org_id, evento, detalhe)
        values (v_rule.id, v_rule.org_id, 'ignorada_cooldown', jsonb_build_object('event_id', v_event.id));
        continue;
      end if;

      begin
        insert into public.automation_runs (rule_id, org_id, trigger_event_id, entity_table, entity_id, payload)
        values (v_rule.id, v_rule.org_id, v_event.id, v_event.entity_table, v_event.entity_id, v_event.payload);
      exception when unique_violation then
        null; -- já há um run ativo para esta regra+entidade — nada a fazer.
      end;
    end loop;

    update public.domain_events set processed_at = now() where id = v_event.id;
  end loop;
end;
$$;

revoke all on function public.process_domain_events(integer) from public, anon, authenticated;
grant execute on function public.process_domain_events(integer) to service_role;
