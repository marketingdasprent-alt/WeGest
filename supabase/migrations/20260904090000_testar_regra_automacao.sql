-- ============================================================================
-- Testar uma automação individualmente, sem correr o motor todo
-- ============================================================================
--
-- O botão "Correr agora" dispara TODOS os scanners e TODO o motor de regras
-- de uma vez (executar_jobs_automacao_manualmente), com um lock global de 5
-- minutos. Não há como confirmar que UMA automação está bem configurada sem
-- disparar tudo o resto.
--
-- testar_regra_automacao(p_rule_id) não participa no ciclo de
-- automation_runs — não cria nenhuma linha lá, não chama
-- execute_automation_runs nem process_domain_events. Reaproveita o último
-- payload real desta regra (a mesma fonte que useUltimoPayloadDaRegra já lê
-- do lado do cliente) e insere uma notificação/email a sério, mas só para
-- quem testou — nunca para os destinatários configurados na regra.
-- ============================================================================

create table public.automacao_regra_teste_cooldown (
  rule_id uuid primary key references public.automation_rules(id) on delete cascade,
  ultimo_teste_em timestamptz not null default now(),
  testado_por uuid
);

alter table public.automacao_regra_teste_cooldown enable row level security;

-- Só testar_regra_automacao (SECURITY DEFINER) lê/escreve esta tabela —
-- nenhuma policy permissiva de propósito, o mesmo desenho que
-- automacao_execucao_manual_lock já usa.
create policy rls_deny_all on public.automacao_regra_teste_cooldown
  for all using (false);

revoke all on public.automacao_regra_teste_cooldown from public, anon, authenticated;

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
  v_notification_id uuid;
  v_email_teste text;
  v_email_enviado boolean := false;
  v_titulo text;
  v_cargo_ids uuid[];
  v_user_ids uuid[];
  v_emails_livres text[];
  v_modo text;
  v_estrategia text;
  v_gestor_nome text;
  v_gestor_user_id uuid;
  v_driver_nome text;
  v_driver_email text;
  v_destinatarios jsonb := '[]'::jsonb;
  v_email_avulso text;
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

  select payload, entity_table, entity_id, created_at
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

  v_titulo := '[Teste] ' || coalesce(v_rule.acao_config->>'titulo', v_rule.nome);

  insert into public.notifications (
    org_id, destinatario_user_id, template_codigo, titulo, payload,
    entity_table, entity_id, rule_run_id, link
  )
  values (
    v_rule.org_id,
    auth.uid(),
    v_rule.acao_config->>'template_codigo',
    v_titulo,
    v_ultimo_run.payload,
    v_ultimo_run.entity_table,
    v_ultimo_run.entity_id,
    null,
    null
  )
  returning id into v_notification_id;

  if v_rule.acao_tipo = 'email' then
    select email into v_email_teste from auth.users where id = auth.uid();

    if v_email_teste is not null then
      insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
      values (v_notification_id, v_rule.org_id, 'email', v_email_teste, v_rule.acao_config->>'template_codigo', v_ultimo_run.payload)
      on conflict (notification_id, canal, destinatario) do nothing;
      v_email_enviado := true;
    end if;
  end if;

  -- ── Quem receberia a sério — só leitura, não insere nada ────────────────
  v_cargo_ids := array(select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_cargo_ids', '[]'::jsonb))::uuid);
  v_user_ids := array(select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_user_ids', '[]'::jsonb))::uuid);
  v_emails_livres := array(select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_emails_livres', '[]'::jsonb)));
  v_modo := coalesce(v_rule.acao_config->>'destinatarios_modo', 'grupo');
  v_estrategia := coalesce(v_rule.acao_config->>'destinatarios_estrategia', 'cargo');

  if v_estrategia = 'motorista' then
    if v_ultimo_run.entity_table = 'motorista_financeiro' then
      select ma.nome, ma.email into v_driver_nome, v_driver_email
      from public.motorista_financeiro mf
      join public.motoristas_ativos ma on ma.id = mf.motorista_id
      where mf.id = v_ultimo_run.entity_id and mf.org_id = v_rule.org_id and ma.org_id = v_rule.org_id;
    elsif v_ultimo_run.entity_table = 'motoristas_ativos' then
      select ma.nome, ma.email into v_driver_nome, v_driver_email
      from public.motoristas_ativos ma
      where ma.id = v_ultimo_run.entity_id and ma.org_id = v_rule.org_id;
    end if;

    if v_driver_email is not null then
      v_destinatarios := v_destinatarios || jsonb_build_array(jsonb_build_object('nome', v_driver_nome, 'email', v_driver_email, 'motivo', 'motorista'));
    end if;
  else
    if v_estrategia = 'gestor_responsavel' then
      if v_ultimo_run.entity_table = 'motoristas_ativos' then
        select m.gestor_responsavel into v_gestor_nome
        from public.motoristas_ativos m
        where m.id = v_ultimo_run.entity_id and m.org_id = v_rule.org_id;
      elsif v_ultimo_run.entity_table = 'viaturas' then
        select m.gestor_responsavel into v_gestor_nome
        from public.motorista_viaturas mv
        join public.motoristas_ativos m on m.id = mv.motorista_id
        where mv.viatura_id = v_ultimo_run.entity_id and m.org_id = v_rule.org_id and mv.status = 'ativo' and mv.data_fim is null
        limit 1;
      end if;

      if v_gestor_nome is not null and btrim(v_gestor_nome) <> '' then
        select p.id into v_gestor_user_id
        from public.profiles p
        where lower(btrim(p.nome)) = lower(btrim(v_gestor_nome)) and p.org_id = v_rule.org_id
        limit 1;
      end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('nome', p.nome, 'email', u.email, 'motivo', case
             when v_gestor_user_id is not null then 'gestor_responsavel'
             when uo.is_admin then 'admin'
             when v_modo = 'individual' then 'individual'
             else 'cargo'
           end)), '[]'::jsonb)
    into v_destinatarios
    from auth.users u
    join public.profiles p on p.id = u.id
    join public.user_organizacoes uo on uo.user_id = u.id and uo.org_id = v_rule.org_id
    where (
      v_gestor_user_id is not null and u.id = v_gestor_user_id
    ) or (
      v_gestor_user_id is null and (
        uo.is_admin = true
        or (
          v_estrategia = 'cargo'
          and uo.cargo_id is not null
          and (
            (v_modo = 'individual' and uo.user_id = any(v_user_ids))
            or (v_modo <> 'individual' and uo.cargo_id = any(v_cargo_ids))
          )
        )
      )
    );
  end if;

  if v_rule.acao_tipo = 'email' then
    foreach v_email_avulso in array v_emails_livres loop
      v_destinatarios := v_destinatarios || jsonb_build_array(jsonb_build_object('nome', v_email_avulso, 'email', v_email_avulso, 'motivo', 'email_avulso'));
    end loop;
  end if;

  return jsonb_build_object(
    'notificacao_id', v_notification_id,
    'email_enviado', v_email_enviado,
    'email_teste', v_email_teste,
    'payload_de', v_ultimo_run.created_at,
    'destinatarios_reais', v_destinatarios
  );
end;
$function$;

revoke all on function public.testar_regra_automacao(uuid) from public, anon;
grant execute on function public.testar_regra_automacao(uuid) to authenticated;
