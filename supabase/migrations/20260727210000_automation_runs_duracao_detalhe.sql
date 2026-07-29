-- Motor de Automação — fecha as colunas duracao_ms/notification_ids de
-- automation_logs, que existem desde 20260727100100 mas nunca eram
-- escritas. Sem isto não dá para mostrar "Criadas 3 notificações →
-- Enviado 1 email" nem "Tempo médio de execução" no dashboard.
-- Ver docs/superpowers/plans/2026-07-27-automacao-dashboard-redesign.md.

create or replace function public.automation_runs_complete(p_run_id uuid, p_detalhe jsonb default '{}'::jsonb)
returns public.automation_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.automation_runs;
  v_duracao_ms integer;
begin
  update public.automation_runs
  set status = 'completed', completed_at = now()
  where id = p_run_id
  returning * into v_run;

  v_duracao_ms := extract(epoch from (v_run.completed_at - v_run.started_at)) * 1000;

  insert into public.automation_logs (run_id, rule_id, org_id, evento, detalhe, duracao_ms)
  values (v_run.id, v_run.rule_id, v_run.org_id, 'executada', p_detalhe, v_duracao_ms);

  return v_run;
end;
$$;

create or replace function public.automation_runs_fail(p_run_id uuid, p_error text)
returns public.automation_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.automation_runs;
  v_duracao_ms integer;
begin
  select * into v_run from public.automation_runs where id = p_run_id for update;

  if v_run.attempt >= v_run.max_attempts then
    update public.automation_runs
    set status = 'failed', error_message = p_error, completed_at = now()
    where id = p_run_id
    returning * into v_run;

    v_duracao_ms := extract(epoch from (v_run.completed_at - v_run.started_at)) * 1000;

    insert into public.failed_jobs (source_table, source_id, org_id, job_type, payload, attempts, last_error)
    values ('automation_runs', v_run.id, v_run.org_id, v_run.job_type, v_run.payload, v_run.attempt, p_error);
  else
    update public.automation_runs
    set status = 'pending',
        error_message = p_error,
        next_attempt_at = now() + (power(2, v_run.attempt) * interval '1 minute')
    where id = p_run_id
    returning * into v_run;

    v_duracao_ms := null;
  end if;

  insert into public.automation_logs (run_id, rule_id, org_id, evento, detalhe, duracao_ms)
  values (v_run.id, v_run.rule_id, v_run.org_id, 'falhou', jsonb_build_object('erro', p_error, 'attempt', v_run.attempt), v_duracao_ms);

  return v_run;
end;
$$;

revoke all on function public.automation_runs_complete(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.automation_runs_fail(uuid, text) from public, anon, authenticated;
grant execute on function public.automation_runs_complete(uuid, jsonb) to service_role;
grant execute on function public.automation_runs_fail(uuid, text) to service_role;

-- ------------------------------------------------------------
-- execute_automation_runs(): passa a contar quantas notifications e
-- quantos notification_queue (emails) criou por run, e informa
-- automation_runs_complete() desse detalhe.

create or replace function public.execute_automation_runs(p_max integer default 20)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.automation_runs;
  v_rule public.automation_rules;
  v_destinatario record;
  v_notification_id uuid;
  v_recurso text;
  v_enviar_email boolean;
  v_estrategia text;
  v_gestor_nome text;
  v_gestor_user_id uuid;
  v_notif_count integer;
  v_email_count integer;
begin
  for v_run in select * from public.automation_runs_claim(p_max)
  loop
    begin
      select * into v_rule from public.automation_rules where id = v_run.rule_id;

      if v_rule.acao_tipo <> 'notificacao' then
        perform public.automation_runs_complete(v_run.id);
        continue;
      end if;

      v_recurso := v_rule.acao_config->>'destinatarios_recurso';
      v_enviar_email := coalesce((v_rule.acao_config->>'enviar_email')::boolean, false);
      v_estrategia := coalesce(v_rule.acao_config->>'destinatarios_estrategia', 'recurso');
      v_gestor_nome := null;
      v_gestor_user_id := null;
      v_notif_count := 0;
      v_email_count := 0;

      if v_estrategia = 'gestor_responsavel' then
        if v_run.entity_table = 'motoristas_ativos' then
          select m.gestor_responsavel into v_gestor_nome
          from public.motoristas_ativos m
          where m.id = v_run.entity_id;
        elsif v_run.entity_table = 'viaturas' then
          select m.gestor_responsavel into v_gestor_nome
          from public.motorista_viaturas mv
          join public.motoristas_ativos m on m.id = mv.motorista_id
          where mv.viatura_id = v_run.entity_id
            and mv.status = 'ativo'
            and mv.data_fim is null
          limit 1;
        end if;

        if v_gestor_nome is not null and btrim(v_gestor_nome) <> '' then
          select p.id into v_gestor_user_id
          from public.profiles p
          where lower(btrim(p.nome)) = lower(btrim(v_gestor_nome))
            and p.org_id = v_run.org_id
          limit 1;
        end if;
      end if;

      for v_destinatario in
        select u.id as user_id, u.email
        from auth.users u
        where (
          v_gestor_user_id is not null and u.id = v_gestor_user_id
        ) or (
          v_gestor_user_id is null and u.id in (
            select uo.user_id
            from public.user_organizacoes uo
            where uo.org_id = v_run.org_id
              and (
                uo.is_admin = true
                or (
                  v_estrategia = 'recurso'
                  and exists (
                    select 1
                    from public.cargo_permissoes cp
                    join public.recursos r on r.id = cp.recurso_id
                    where cp.cargo_id = uo.cargo_id
                      and r.nome = v_recurso
                      and cp.tem_acesso = true
                  )
                )
              )
          )
        )
      loop
        insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo, payload, entity_table, entity_id, rule_run_id)
        values (
          v_run.org_id,
          v_destinatario.user_id,
          v_rule.acao_config->>'template_codigo',
          coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
          v_run.payload,
          v_run.entity_table,
          v_run.entity_id,
          v_run.id
        )
        returning id into v_notification_id;
        v_notif_count := v_notif_count + 1;

        if v_enviar_email and v_destinatario.email is not null then
          insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
          values (v_notification_id, v_run.org_id, 'email', v_destinatario.email, v_rule.acao_config->>'template_codigo', v_run.payload);
          v_email_count := v_email_count + 1;
        end if;
      end loop;

      perform public.automation_runs_complete(
        v_run.id,
        jsonb_build_object('notificacoes_criadas', v_notif_count, 'emails_enviados', v_email_count)
      );
    exception when others then
      perform public.automation_runs_fail(v_run.id, sqlerrm);
    end;
  end loop;
end;
$$;

revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;
