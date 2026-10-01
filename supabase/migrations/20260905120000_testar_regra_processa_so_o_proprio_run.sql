-- ============================================================================
-- "Testar" processa só o seu próprio run — não até 20 de qualquer organização
-- ============================================================================
--
-- `testar_regra_automacao` cria um run a sério e chama `execute_automation_runs()`
-- sem âmbito nenhum — que reclama até 20 runs PENDENTES DE QUALQUER
-- ORGANIZAÇÃO (`automation_runs_claim` não filtra por org, é uma fila só,
-- por desenho). Um "Testar" na tua organização podia processar — e enviar
-- emails a sério para — automações pendentes de outras organizações que
-- calhassem estar na fila nesse momento.
--
-- A lógica de processar UM run passa para `processar_automation_run`,
-- partilhada pelas duas: `execute_automation_runs` continua a reclamar até
-- p_max e a processá-los um a um, exactamente como antes; `testar_regra_automacao`
-- passa a chamar-a directamente sobre o run que acabou de criar, sem tocar
-- em mais nenhum.
-- ============================================================================

create or replace function public.processar_automation_run(v_run public.automation_runs)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rule public.automation_rules;
  v_destinatario record;
  v_notification_id uuid;
  v_cargo_ids uuid[];
  v_user_ids uuid[];
  v_emails_livres text[];
  v_email_externo text;
  v_modo text;
  v_enviar_email boolean;
  v_enviar_email_digest boolean;
  v_estrategia text;
  v_gestor_nome text;
  v_gestor_user_id uuid;
  v_notif_count integer;
  v_email_count integer;
  v_tipo_legado text;
  v_link text;
  v_viatura_id uuid;
  v_driver_motorista_id uuid;
  v_driver_user_id uuid;
  v_driver_email text;
  v_email_por_enviar_motorista text;
begin
  if v_run.rule_snapshot is null then
    perform public.automation_runs_fail(
      v_run.id,
      'Run sem definição congelada (anterior à Fase 3). Reagendar adopta a definição actual.'
    );
    return;
  end if;

  v_rule := jsonb_populate_record(null::public.automation_rules, v_run.rule_snapshot->'regra');

  if v_rule.org_id is distinct from v_run.org_id then
    perform public.automation_runs_fail(
      v_run.id,
      'Definição congelada de outra organização'
    );
    return;
  end if;

  if v_rule.acao_tipo = 'automacao_interna' then
    perform public.automation_runs_complete(
      v_run.id,
      public.fn_executar_accao_interna(v_run.org_id, v_run.entity_table, v_run.entity_id, v_rule.acao_config));
    return;
  end if;

  if v_rule.acao_tipo not in ('notificacao', 'email') then
    perform public.automation_runs_complete(v_run.id);
    return;
  end if;

  v_cargo_ids := array(
    select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_cargo_ids', '[]'::jsonb))::uuid
  );
  v_user_ids := array(
    select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_user_ids', '[]'::jsonb))::uuid
  );
  v_emails_livres := array(
    select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_emails_livres', '[]'::jsonb))
  );
  v_modo := coalesce(v_rule.acao_config->>'destinatarios_modo', 'grupo');
  v_enviar_email := (v_rule.acao_tipo = 'email');
  v_enviar_email_digest := coalesce((v_rule.acao_config->>'enviar_email_digest')::boolean, false);
  v_estrategia := coalesce(v_rule.acao_config->>'destinatarios_estrategia', 'cargo');
  v_gestor_nome := null;
  v_gestor_user_id := null;
  v_driver_motorista_id := null;
  v_driver_user_id := null;
  v_driver_email := null;
  v_notification_id := null;
  v_notif_count := 0;
  v_email_count := 0;
  v_email_por_enviar_motorista := null;

  v_tipo_legado := case v_rule.event_type
    when 'viatura.seguro_expirando' then 'viatura_seguro_expirando'
    when 'viatura.inspecao_expirando' then 'viatura_inspecao_expirando'
    when 'motorista.carta_expirando' then 'motorista_carta_expirando'
    when 'motorista.licenca_tvde_expirando' then 'motorista_licenca_tvde_expirando'
    when 'cobranca.gerada' then 'cobranca_gerada'
    when 'utilizador.criado' then 'utilizador_criado'
    when 'contrato_renting.renovacao_proxima' then 'contrato_renting_renovacao_proxima'
    when 'contrato_renting.criado' then 'contrato_renting_criado'
    when 'motorista.candidatura_parada' then 'motorista_candidatura_parada'
    when 'contrato_renting.sem_checkin' then 'contrato_renting_sem_checkin'
    when 'viatura.extintor_expirando' then 'viatura_extintor_expirando'
    when 'viatura.iuc_a_pagar' then 'viatura_iuc_a_pagar'
    when 'viatura.manutencao_preventiva_expirando' then 'viatura_manutencao_preventiva_expirando'
    when 'motorista.reparacao_cobranca' then 'motorista_reparacao_cobranca'
    when 'assistencia_ticket.aberto_demasiado_tempo' then 'assistencia_ticket_aberto_demasiado_tempo'
    when 'motorista.ficha_incompleta' then 'motorista_ficha_incompleta'
    when 'invoice.nao_enviada_ao_cliente' then 'invoice_nao_enviada_ao_cliente'
    when 'seguranca.login_suspeito' then 'seguranca_login_suspeito'
    else null
  end;

  v_viatura_id := case when v_run.entity_table = 'viaturas' then v_run.entity_id else null end;
  v_link := case v_run.entity_table
    when 'viaturas' then '/viaturas/' || v_run.entity_id::text
    when 'motoristas_ativos' then '/motoristas/' || v_run.entity_id::text
    when 'contratos_renting' then '/renting/contratos/' || v_run.entity_id::text
    when 'profiles' then '/admin/utilizadores'
    when 'motorista_candidaturas' then '/motoristas/candidaturas'
    when 'assistencia_tickets' then '/assistencia/' || v_run.entity_id::text
    else null
  end;

  if v_estrategia = 'motorista' then
    if v_run.entity_table = 'motorista_financeiro' then
      select mf.motorista_id, ma.user_id, ma.email
      into v_driver_motorista_id, v_driver_user_id, v_driver_email
      from public.motorista_financeiro mf
      join public.motoristas_ativos ma on ma.id = mf.motorista_id
      where mf.id = v_run.entity_id
        and mf.org_id = v_run.org_id
        and ma.org_id = v_run.org_id;
    elsif v_run.entity_table = 'motoristas_ativos' then
      select ma.id, ma.user_id, ma.email
      into v_driver_motorista_id, v_driver_user_id, v_driver_email
      from public.motoristas_ativos ma
      where ma.id = v_run.entity_id
        and ma.org_id = v_run.org_id;
    end if;

    if v_driver_motorista_id is null then
      perform public.automation_runs_fail(
        v_run.id,
        'Entidade inexistente ou de outra organização'
      );
      return;
    end if;

    v_link := '/motoristas/' || v_driver_motorista_id::text;

    if v_driver_user_id is not null then
      insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo, payload, entity_table, entity_id, rule_run_id, link)
      values (
        v_run.org_id,
        v_driver_user_id,
        v_rule.acao_config->>'template_codigo',
        coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
        v_run.payload,
        v_run.entity_table,
        v_run.entity_id,
        v_run.id,
        v_link
      )
      on conflict (rule_run_id, destinatario_user_id) where rule_run_id is not null
      do update set rule_run_id = notifications.rule_run_id
      returning id into v_notification_id;
      v_notif_count := v_notif_count + 1;

      if v_rule.acao_tipo = 'notificacao' and v_tipo_legado is not null then
        insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade, destinatario_id, link, viatura_id, rule_run_id)
        values (
          v_run.org_id,
          v_tipo_legado,
          coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
          null,
          'normal',
          v_driver_user_id,
          v_link,
          v_viatura_id,
          v_run.id
        )
        on conflict (rule_run_id, destinatario_id) where rule_run_id is not null do nothing;
      end if;
    end if;

    if v_enviar_email and v_driver_email is not null and v_notification_id is not null then
      insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
      values (v_notification_id, v_run.org_id, 'email', v_driver_email, v_rule.acao_config->>'template_codigo', v_run.payload)
      on conflict (notification_id, canal, destinatario) do nothing;
      v_email_count := v_email_count + 1;
    end if;

    if v_enviar_email and v_driver_email is not null and v_notification_id is null then
      v_email_por_enviar_motorista := 'motorista sem conta de utilizador';
    end if;
  else
    if v_estrategia = 'gestor_responsavel' then
      if v_run.entity_table = 'motoristas_ativos' then
        select m.gestor_responsavel into v_gestor_nome
        from public.motoristas_ativos m
        where m.id = v_run.entity_id
          and m.org_id = v_run.org_id;
      elsif v_run.entity_table = 'viaturas' then
        select m.gestor_responsavel into v_gestor_nome
        from public.motorista_viaturas mv
        join public.motoristas_ativos m on m.id = mv.motorista_id
        where mv.viatura_id = v_run.entity_id
          and m.org_id = v_run.org_id
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
              (uo.is_admin = true and v_rule.acao_tipo <> 'email')
              or (
                v_estrategia = 'cargo'
                and uo.cargo_id is not null
                and (
                  (v_modo = 'individual' and uo.user_id = any(v_user_ids))
                  or (v_modo <> 'individual' and uo.cargo_id = any(v_cargo_ids))
                )
              )
            )
        )
      )
    loop
      insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo, payload, entity_table, entity_id, rule_run_id, link)
      values (
        v_run.org_id,
        v_destinatario.user_id,
        v_rule.acao_config->>'template_codigo',
        coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
        v_run.payload,
        v_run.entity_table,
        v_run.entity_id,
        v_run.id,
        v_link
      )
      on conflict (rule_run_id, destinatario_user_id) where rule_run_id is not null
      do update set rule_run_id = notifications.rule_run_id
      returning id into v_notification_id;
      v_notif_count := v_notif_count + 1;

      if v_rule.acao_tipo = 'notificacao' and v_tipo_legado is not null then
        insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade, destinatario_id, link, viatura_id, rule_run_id)
        values (
          v_run.org_id,
          v_tipo_legado,
          coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
          null,
          'normal',
          v_destinatario.user_id,
          v_link,
          v_viatura_id,
          v_run.id
        )
        on conflict (rule_run_id, destinatario_id) where rule_run_id is not null do nothing;
      end if;

      if v_enviar_email and not v_enviar_email_digest and v_destinatario.email is not null then
        insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
        values (v_notification_id, v_run.org_id, 'email', v_destinatario.email, v_rule.acao_config->>'template_codigo', v_run.payload)
        on conflict (notification_id, canal, destinatario) do nothing;
        v_email_count := v_email_count + 1;
      end if;
    end loop;
  end if;

  if v_rule.acao_tipo = 'email' then
    foreach v_email_externo in array v_emails_livres loop
      insert into public.notifications (org_id, destinatario_email_externo, template_codigo, titulo, payload, entity_table, entity_id, rule_run_id, link)
      values (
        v_run.org_id,
        v_email_externo,
        v_rule.acao_config->>'template_codigo',
        coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
        v_run.payload,
        v_run.entity_table,
        v_run.entity_id,
        v_run.id,
        v_link
      )
      on conflict (rule_run_id, destinatario_email_externo) where rule_run_id is not null and destinatario_email_externo is not null
      do update set rule_run_id = notifications.rule_run_id
      returning id into v_notification_id;
      v_notif_count := v_notif_count + 1;

      insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
      values (v_notification_id, v_run.org_id, 'email', v_email_externo, v_rule.acao_config->>'template_codigo', v_run.payload)
      on conflict (notification_id, canal, destinatario) do nothing;
      v_email_count := v_email_count + 1;
    end loop;
  end if;

  perform public.automation_runs_complete(
    v_run.id,
    jsonb_build_object(
      'notificacoes_criadas', v_notif_count,
      'emails_enviados', v_email_count,
      'sem_destinatarios', v_notif_count = 0,
      'email_por_enviar', v_email_por_enviar_motorista
    )
  );
exception when others then
  perform public.automation_runs_fail(v_run.id, sqlerrm);
end;
$function$;

revoke all on function public.processar_automation_run(public.automation_runs) from public, anon, authenticated;
grant execute on function public.processar_automation_run(public.automation_runs) to service_role;

-- ── execute_automation_runs passa a delegar em processar_automation_run ────
create or replace function public.execute_automation_runs(p_max integer default 20)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run public.automation_runs;
begin
  for v_run in select * from public.automation_runs_claim(p_max)
  loop
    perform public.processar_automation_run(v_run);
  end loop;
end;
$function$;

revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;

-- ── testar_regra_automacao processa só o run que acabou de criar ───────────
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
  v_run_reclamado public.automation_runs;
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
    raise exception 'Já há uma execução em curso para esta automação — aguarda o motor terminar antes de testar outra vez.';
  end;

  -- Processa só ESTE run — não os até 20 pendentes de qualquer organização
  -- que `execute_automation_runs()` reclamaria. `status`/`started_at`/
  -- `attempt` replicam exactamente o que `automation_runs_claim` faria: sem
  -- `started_at`, `automation_runs_complete` calcula uma duração nula (fica
  -- a subtrair de NULL).
  update public.automation_runs
  set status = 'running', started_at = now(), attempt = attempt + 1
  where id = v_run_id
  returning * into v_run_reclamado;

  perform public.processar_automation_run(v_run_reclamado);

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
