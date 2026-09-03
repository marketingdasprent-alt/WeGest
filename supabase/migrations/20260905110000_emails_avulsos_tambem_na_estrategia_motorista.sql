-- ============================================================================
-- destinatarios_emails_livres passa a valer também com estrategia='motorista'
-- ============================================================================
--
-- O ramo `estrategia = 'motorista'` termina com `automation_runs_complete` +
-- `continue` próprios, ANTES de chegar ao bloco partilhado que insere os
-- endereços livres (destinatarios_emails_livres). O validador e a UI aceitam
-- essa chave em qualquer acção de email, sejam quais forem os destinatários
-- por cargo — mas o executor ignorava-a em silêncio sempre que a estratégia
-- era 'motorista' (duas regras semeadas usam-na:
-- motorista.reparacao_cobranca, motorista.ficha_incompleta).
--
-- O ramo passa a só resolver o motorista e a NÃO sair — o bloco partilhado
-- dos endereços livres e o `automation_runs_complete` final passam a servir
-- as duas estratégias. O diagnóstico "motorista sem conta de utilizador"
-- (que dependia de `v_notification_id` estar ainda com o valor do motorista
-- nesse ponto) passa para uma variável própria, capturada logo ali — senão
-- o bloco dos avulsos, que roda a seguir, pisava esse valor.
-- ============================================================================

create or replace function public.execute_automation_runs(p_max integer default 20)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run public.automation_runs;
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
  for v_run in select * from public.automation_runs_claim(p_max)
  loop
    begin
      if v_run.rule_snapshot is null then
        perform public.automation_runs_fail(
          v_run.id,
          'Run sem definição congelada (anterior à Fase 3). Reagendar adopta a definição actual.'
        );
        continue;
      end if;

      v_rule := jsonb_populate_record(null::public.automation_rules, v_run.rule_snapshot->'regra');

      if v_rule.org_id is distinct from v_run.org_id then
        perform public.automation_runs_fail(
          v_run.id,
          'Definição congelada de outra organização'
        );
        continue;
      end if;

      if v_rule.acao_tipo = 'automacao_interna' then
        perform public.automation_runs_complete(
          v_run.id,
          public.fn_executar_accao_interna(v_run.org_id, v_run.entity_table, v_run.entity_id, v_rule.acao_config));
        continue;
      end if;

      if v_rule.acao_tipo not in ('notificacao', 'email') then
        perform public.automation_runs_complete(v_run.id);
        continue;
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
          continue;
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

        -- Capturado aqui, antes do bloco dos endereços livres (que roda a
        -- seguir e reescreve v_notification_id): sem isto, o diagnóstico
        -- media o estado errado.
        if v_enviar_email and v_driver_email is not null and v_notification_id is null then
          v_email_por_enviar_motorista := 'motorista sem conta de utilizador';
        end if;

        -- Sem `continue` aqui — os endereços livres (bloco partilhado, mais
        -- abaixo) e o automation_runs_complete final também servem esta
        -- estratégia agora.
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

      -- Endereços externos: agora vale para QUALQUER estratégia de email —
      -- 'motorista' incluída. Só faz sentido numa acção de email — o
      -- validador já garante que a chave nunca aparece numa notificação.
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
  end loop;
end;
$function$;

revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;
