-- Corrige fuga de dados entre organizações em execute_automation_runs.
--
-- CAUSA
-- `v_notification_id` é declarado uma vez por CHAMADA da função, mas o bloco
-- que repõe as variáveis a cada `v_run` do lote nunca o repunha. No ramo da
-- estratégia 'motorista', o INSERT em `notifications` está dentro de
-- `if v_driver_user_id is not null`, mas o INSERT em `notification_queue`
-- estava FORA. Um motorista com email e sem conta de utilizador caía assim:
--
--   · era o primeiro run do lote  → v_notification_id NULL → violação de
--     NOT NULL em notification_queue.notification_id → o run falhava;
--   · vinha depois de outro run   → v_notification_id ainda apontava para a
--     notificação do run ANTERIOR, possivelmente de outra organização. O email
--     seguia para o motorista certo mas renderizado com os dados dessa outra
--     notificação: enrichContext.ts lê `destinatarioNome`, `ctaUrl` e
--     `viaturaMarcaModelo` a partir da linha de `notifications`.
--
-- IMPACTO MEDIDO (2026-08-26)
--   · 14 emails enviados com a notificação de outro destinatário, todos para o
--     mesmo endereço; 13 deles a atravessar organizações (org da fila
--     c0918dc8… vs org da notificação 11111111…), entre 2026-07-29 e hoje.
--   · 4 runs falhados com "null value in column notification_id".
--
-- CORREÇÃO
--   1. Repor `v_notification_id := null` no bloco de reset por run.
--   2. Só enfileirar o email quando existe notificação criada NESTE run.
--   3. Registar no detalhe do run quando o email não foi enviado por o
--      motorista não ter conta — para a lacuna ficar visível em vez de muda.
--
-- NOTA (fora do âmbito desta correcção, decisão do produto)
-- `notifications.destinatario_user_id` e `notification_queue.notification_id`
-- são NOT NULL, portanto o pipeline de email exige uma conta de utilizador.
-- Há 502 motoristas com email e sem conta contra 37 com conta: com esta
-- correcção deixam de receber estes emails de forma silenciosa — hoje também
-- não os recebiam, mas o run rebentava. Passa a completar e a dizer porquê.

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
      -- (a) A regra tem de pertencer à mesma organização do run.
      select * into v_rule
      from public.automation_rules
      where id = v_run.rule_id
        and org_id = v_run.org_id;

      if not found then
        perform public.automation_runs_fail(
          v_run.id,
          'Regra inexistente ou de outra organização'
        );
        continue;
      end if;

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
      -- (1) SEM ISTO, o id da notificação do run anterior sobrevivia para o
      -- run seguinte — foi por aqui que emails saíram com os dados de outra
      -- organização. As variáveis são por chamada, não por iteração.
      v_notification_id := null;
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
        -- (b) O motorista tem de ser da org do run. Sem isto, um entity_id
        -- apontado a outra organização punha o email dela na fila de envio.
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

        -- (2) `v_notification_id is not null` garante que a linha da fila
        -- aponta para a notificação criada NESTE run e para mais nenhuma.
        if v_enviar_email and v_driver_email is not null and v_notification_id is not null then
          insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
          values (v_notification_id, v_run.org_id, 'email', v_driver_email, v_rule.acao_config->>'template_codigo', v_run.payload);
          v_email_count := v_email_count + 1;
        end if;

        perform public.automation_runs_complete(
          v_run.id,
          jsonb_build_object(
            'notificacoes_criadas', v_notif_count,
            'emails_enviados', v_email_count,
            -- (3) A lacuna fica registada em vez de desaparecer em silêncio.
            'email_por_enviar', case
              when v_enviar_email
               and v_driver_email is not null
               and v_notification_id is null
              then 'motorista sem conta de utilizador'
              else null
            end
          )
        );
        continue;
      end if;

      if v_estrategia = 'gestor_responsavel' then
        -- Também aqui: o nome do gestor é lido a partir de dados da entidade,
        -- e a entidade tem de ser da org do run.
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

      -- Esta parte já estava correcta: os destinatários saem sempre de
      -- user_organizacoes filtrado por `uo.org_id = v_run.org_id`, pelo que
      -- ids de cargo/utilizador vindos da config nunca alcançam outra org.
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
$function$;
