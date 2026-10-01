-- ============================================================================
-- "Testar" avisa com uma mensagem clara quando já há um run activo
-- ============================================================================
--
-- `idx_automation_runs_one_active_per_rule_entity` (índice único parcial em
-- rule_id+entity_table+entity_id, para status pending/running) impede duas
-- execuções activas da mesma regra sobre a mesma entidade. process_domain_events
-- já trata isto — `exception when unique_violation then null` — mas
-- testar_regra_automacao não: se já houver um run pendente para esta
-- regra+entidade (o cron ainda não o processou, ou um clique duplo em
-- "Testar"), o insert rebentava com um erro cru de chave duplicada.
-- ============================================================================

create or replace function public.testar_regra_automacao(p_rule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rule public.automation_rules;
  v_ultimo_run record;
  v_cooldown record;
  v_restante interval;
  v_intervalo constant interval := interval '30 seconds';
  v_run_id uuid;
  v_status text;
  v_erro text;
  v_notif_count int;
  v_fila_count int;
begin
  if not (is_current_user_admin() or can_edit(auth.uid(), 'automacoes')) then
    raise exception 'Sem permissão para testar automações.';
  end if;

  select * into v_rule
  from public.automation_rules
  where id = p_rule_id
    and org_id = get_current_org_id();

  if v_rule.id is null then
    raise exception 'Regra não encontrada.';
  end if;

  if v_rule.acao_tipo not in ('notificacao', 'email') then
    raise exception 'Só é possível testar acções de notificação ou email.';
  end if;

  select * into v_cooldown
  from public.automacao_regra_teste_cooldown
  where rule_id = p_rule_id
  for update;

  if v_cooldown.ultimo_teste_em is not null and now() - v_cooldown.ultimo_teste_em < v_intervalo then
    v_restante := v_intervalo - (now() - v_cooldown.ultimo_teste_em);
    raise exception 'Já testaste esta automação há pouco — aguarda mais % antes de repetir.', to_char(v_restante, 'MI:SS');
  end if;

  select payload, entity_table, entity_id
  into v_ultimo_run
  from public.automation_runs
  where rule_id = p_rule_id
  order by created_at desc, id desc
  limit 1;

  if v_ultimo_run.payload is null then
    raise exception 'Esta automação ainda não correu — não há dados para testar.';
  end if;

  insert into public.automacao_regra_teste_cooldown (rule_id, ultimo_teste_em, testado_por)
  values (p_rule_id, now(), auth.uid())
  on conflict (rule_id) do update set ultimo_teste_em = now(), testado_por = auth.uid();

  begin
    insert into public.automation_runs (
      org_id, rule_id, entity_table, entity_id, payload, status, rule_snapshot
    )
    values (
      v_rule.org_id,
      v_rule.id,
      v_ultimo_run.entity_table,
      v_ultimo_run.entity_id,
      v_ultimo_run.payload,
      'pending',
      public.automation_rule_snapshot(v_rule)
    )
    returning id into v_run_id;
  exception when unique_violation then
    -- idx_automation_runs_one_active_per_rule_entity: já há um run
    -- pending/running para esta regra+entidade. Não é um erro do teste —
    -- é o motor a fazer exactamente o que a garantia promete.
    raise exception 'Já há uma execução em curso para esta automação — aguarda o motor terminar antes de testar outra vez.';
  end;

  perform public.execute_automation_runs();

  select status, error_message into v_status, v_erro
  from public.automation_runs
  where id = v_run_id;

  select count(*) into v_notif_count
  from public.notifications
  where rule_run_id = v_run_id;

  select count(*) into v_fila_count
  from public.notification_queue q
  join public.notifications n on n.id = q.notification_id
  where n.rule_run_id = v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id,
    'status', v_status,
    'erro', v_erro,
    'notificacoes_criadas', v_notif_count,
    'emails_enfileirados', v_fila_count,
    'destinatarios', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', coalesce(n.destinatario_email_externo, u.email),
               'nome', coalesce(p.nome, n.destinatario_email_externo)
             ) order by coalesce(n.destinatario_email_externo, u.email)), '[]'::jsonb)
      from public.notifications n
      left join auth.users u on u.id = n.destinatario_user_id
      left join public.profiles p on p.id = n.destinatario_user_id
      where n.rule_run_id = v_run_id
    )
  );
end;
$function$;

revoke all on function public.testar_regra_automacao(uuid) from public, anon;
grant execute on function public.testar_regra_automacao(uuid) to authenticated;
