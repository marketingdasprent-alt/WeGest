-- Motor de Automação — Fase 2, Sub-projeto 6: Automation Executor. Para
-- acao_tipo='notificacao', resolve destinatários por recurso RBAC e cria
-- notifications (+ notification_queue quando enviar_email=true). Outros
-- acao_tipo apenas concluem, sem ação, por agora.
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-executor.md.

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

      -- Resolução direta (NÃO via has_permission — essa função depende de
      -- get_current_org_id(), que não existe numa sessão de background job).
      for v_destinatario in
        select uo.user_id, u.email
        from public.user_organizacoes uo
        join auth.users u on u.id = uo.user_id
        where uo.org_id = v_run.org_id
          and (
            uo.is_admin = true
            or exists (
              select 1
              from public.cargo_permissoes cp
              join public.recursos r on r.id = cp.recurso_id
              where cp.cargo_id = uo.cargo_id
                and r.nome = v_recurso
                and cp.tem_acesso = true
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

        if v_enviar_email and v_destinatario.email is not null then
          insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
          values (v_notification_id, v_run.org_id, 'email', v_destinatario.email, v_rule.acao_config->>'template_codigo', v_run.payload);
        end if;
      end loop;

      perform public.automation_runs_complete(v_run.id);
    exception when others then
      perform public.automation_runs_fail(v_run.id, sqlerrm);
    end;
  end loop;
end;
$$;

revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;
