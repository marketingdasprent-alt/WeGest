-- Hardening do Motor de Automações (pré-produção) — Prioridade 1,
-- item 4: plano de cutover notifications vs notificacoes.
--
-- DECISÃO (documentada aqui, não só em texto): `notifications` é a
-- tabela final (schema mais rico: lida/lida_em/resolvida/link/
-- entity_table/entity_id); `notificacoes` é a que será descontinuada.
-- HOJE NÃO É SEGURO CONCLUIR O CUTOVER: nenhum componente de frontend
-- lê de `notifications` (bell, popup, NotificacoesContext, página de
-- notificações — tudo lê `notificacoes`); migrar agora seria uma
-- mudança de UX de risco fora do âmbito deste hardening ("não alterar
-- a UX", "não redesenhar").
--
-- O QUE FICA PREPARADO sem quebrar nada: execute_automation_runs() já
-- calculava v_link corretamente para o dual-write em notificacoes.link,
-- mas nunca gravava esse valor em notifications.link (ficava sempre
-- NULL) — isso teria de ser corrigido de qualquer forma antes de um
-- cutover futuro. Corrige-se agora, e fica só a fazer a troca do lado
-- do frontend quando isso for decidido.

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
  v_cargo_ids uuid[];
  v_user_ids uuid[];
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
begin
  for v_run in select * from public.automation_runs_claim(p_max)
  loop
    begin
      select * into v_rule from public.automation_rules where id = v_run.rule_id;

      if v_rule.acao_tipo <> 'notificacao' then
        perform public.automation_runs_complete(v_run.id);
        continue;
      end if;

      v_cargo_ids := array(
        select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_cargo_ids', '[]'::jsonb))::uuid
      );
      v_user_ids := array(
        select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_user_ids', '[]'::jsonb))::uuid
      );
      v_modo := coalesce(v_rule.acao_config->>'destinatarios_modo', 'grupo');
      v_enviar_email := coalesce((v_rule.acao_config->>'enviar_email')::boolean, false);
      v_enviar_email_digest := coalesce((v_rule.acao_config->>'enviar_email_digest')::boolean, false);
      v_estrategia := coalesce(v_rule.acao_config->>'destinatarios_estrategia', 'cargo');
      v_gestor_nome := null;
      v_gestor_user_id := null;
      v_driver_motorista_id := null;
      v_driver_user_id := null;
      v_driver_email := null;
      v_notif_count := 0;
      v_email_count := 0;

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
          where mf.id = v_run.entity_id;
        elsif v_run.entity_table = 'motoristas_ativos' then
          select ma.id, ma.user_id, ma.email
          into v_driver_motorista_id, v_driver_user_id, v_driver_email
          from public.motoristas_ativos ma
          where ma.id = v_run.entity_id;
        end if;

        v_link := case when v_driver_motorista_id is not null then '/motoristas/' || v_driver_motorista_id::text else null end;

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
          returning id into v_notification_id;
          v_notif_count := v_notif_count + 1;

          if v_tipo_legado is not null then
            insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade, destinatario_id, link, viatura_id)
            values (
              v_run.org_id,
              v_tipo_legado,
              coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
              null,
              'normal',
              v_driver_user_id,
              v_link,
              v_viatura_id
            );
          end if;
        end if;

        if v_enviar_email and v_driver_email is not null then
          insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
          values (v_notification_id, v_run.org_id, 'email', v_driver_email, v_rule.acao_config->>'template_codigo', v_run.payload);
          v_email_count := v_email_count + 1;
        end if;

        perform public.automation_runs_complete(
          v_run.id,
          jsonb_build_object('notificacoes_criadas', v_notif_count, 'emails_enviados', v_email_count)
        );
        continue;
      end if;

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
        returning id into v_notification_id;
        v_notif_count := v_notif_count + 1;

        if v_tipo_legado is not null then
          insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade, destinatario_id, link, viatura_id)
          values (
            v_run.org_id,
            v_tipo_legado,
            coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
            null,
            'normal',
            v_destinatario.user_id,
            v_link,
            v_viatura_id
          );
        end if;

        if v_enviar_email and not v_enviar_email_digest and v_destinatario.email is not null then
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

-- Mesma correção no trigger direto (item 1/12): handle_failed_job_notify()
-- e handle_via_verde_sync_failed() só escrevem em notificacoes hoje
-- (alertas técnicos diretos aos admins, fora do motor de regras) — não
-- passam por notifications, por isso não têm o mesmo gap.
