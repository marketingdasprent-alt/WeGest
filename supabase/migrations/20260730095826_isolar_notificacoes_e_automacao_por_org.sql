-- Isolamento multi-organização do sistema de notificações e automações.
--
-- CONTEXTO
-- As tabelas estão corretamente isoladas por RLS (`rls_org_isolation`
-- RESTRICTIVE em notificacoes, automation_*, email_sends; e todas as policies
-- de SELECT de email exigem `org_id = get_current_org_id()`). O problema não
-- está nas tabelas — está nas funções `SECURITY DEFINER`, que correm como
-- owner e portanto **ignoram RLS**. Nessas, o isolamento tem de ser escrito à
-- mão, e faltava em três sítios.
--
-- Verificado antes de aplicar: 0 linhas contaminadas em produção
-- (notificacoes/notifications/notification_queue/email_sends sem org_id, runs
-- com regra de outra org, e notificações dirigidas a utilizadores de fora da
-- própria org — tudo a zero). Estas alterações são preventivas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. resolver_notificacao — a falha mais séria
--
-- Fazia `select * from notificacoes where id = p_id` e, mais abaixo, o
-- `update ... where id = p_id`. Sem RLS (definer) e sem org: qualquer
-- utilizador com cargo de gestão **na sua própria org** conseguia fechar uma
-- notificação de OUTRA organização, dado o uuid. Num produto de compliance
-- isso é fazer desaparecer o aviso de uma carta de condução a caducar de outra
-- empresa.
--
-- Pior: o escalonamento no fim inseria uma notificação em `v_notif.org_id` —
-- a org alheia — com o NOME do utilizador que fechou. Ou seja, além da
-- escrita cruzada, injetava o nome de um funcionário de A no feed de B.
--
-- Não era explorável às cegas (é preciso conhecer um uuid), mas a função não
-- tinha noção de inquilino nenhuma, e é isso que se corrige.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.resolver_notificacao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notif public.notificacoes;
  v_cargo text;
  v_nome text;
  v_is_admin boolean;
  v_org uuid;
begin
  v_org := get_current_org_id();
  if v_org is null then
    raise exception 'Sem organização activa';
  end if;

  -- O filtro por org entra já aqui: sem ele, o resto da função opera sobre uma
  -- linha que o chamador nunca deveria ter conseguido ler.
  select * into v_notif
  from public.notificacoes
  where id = p_id
    and org_id = v_org;

  -- Silencioso de propósito quando não existe: distinguir "não é sua" de
  -- "não existe" confirmaria a existência de notificações de outras orgs.
  if not found or v_notif.resolvida then
    return;
  end if;

  v_cargo := current_user_cargo();
  v_is_admin := is_current_user_admin();
  select nome into v_nome from public.profiles where id = auth.uid();

  -- O destinatário do aviso pode sempre fechar o seu próprio aviso.
  -- Caso contrário, exige cargo de gestão (fluxo das candidaturas).
  if v_notif.destinatario_id is not null and v_notif.destinatario_id = auth.uid() then
    null;
  elsif not (
    v_is_admin
    or v_cargo in ('Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE')
  ) then
    raise exception 'Sem permissão para resolver notificações';
  end if;

  update public.notificacoes
  set resolvida = true,
      resolvida_por = auth.uid(),
      resolvida_por_nome = v_nome,
      resolvida_em = now()
  where id = p_id
    and org_id = v_org;

  -- Escalonamento: só para motorista_pendente fechado por gestor/admin.
  -- `v_org` e não `v_notif.org_id`: são agora iguais por construção, e usar a
  -- org do chamador deixa explícito que nunca se escreve fora dela.
  if v_notif.tipo = 'motorista_pendente'
     and (v_is_admin or v_cargo in ('Gestor TVDE', 'Administrador')) then
    insert into public.notificacoes (org_id, tipo, candidatura_id, titulo, mensagem, severidade)
    values (
      v_org,
      'escalonamento',
      v_notif.candidatura_id,
      'Aviso fechado por um gestor',
      coalesce(v_nome, 'Um gestor') || ' fechou o aviso de um motorista pendente. Verifique a candidatura.',
      'urgente'
    );
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. execute_automation_runs — regra e entidade têm de ser da org do run
--
-- Duas leituras sem org, ambas em código definer:
--
--   a) `select * into v_rule from automation_rules where id = v_run.rule_id`
--      — a config da regra (título, template, destinatários) podia vir de
--      outra organização.
--
--   b) na estratégia 'motorista', o motorista era lido só por
--      `where id = v_run.entity_id`. `automation_runs.entity_id` é polimórfico
--      e **não tem chave estrangeira**, logo aceita qualquer uuid. Um run
--      apontado ao motorista de outra org fazia a função ler o email dele e
--      **meter na fila um email** para esse endereço, com o payload do run.
--
--  Hoje não é alcançável do cliente (automation_runs não tem policy PERMISSIVE
--  de INSERT, logo o frontend não consegue criar runs — só triggers definer o
--  fazem, e esses derivam o org_id da própria linha). Fica corrigido como
--  defesa em profundidade: a função deixa de depender de quem a alimenta.
-- ─────────────────────────────────────────────────────────────────────────────
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
      v_notif_count := 0;
      v_email_count := 0;

      v_tipo_legado := case v_run.event_type
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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Funções de cron deixam de ser chamáveis pelo cliente
--
-- Estas correm em nome de TODAS as organizações (varrem a tabela inteira) e
-- estavam com EXECUTE para `authenticated`. Nenhuma é chamada pelo frontend
-- (confirmado: só aparecem em types.ts, gerado). Qualquer utilizador podia
-- forçar um envio global de digests — não vazava conteúdo entre orgs, porque
-- o digest agrupa por org_id, mas gastava o limite diário de email de todos e
-- disparava correio em nome de empresas terceiras.
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.enviar_digests_diarios() from authenticated;
revoke execute on function public.notificar_lista_espera_viatura() from authenticated;
revoke execute on function public.notificar_motorista_pendente() from authenticated;
revoke execute on function public.notificar_pedido_troca_kms() from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Fim do ramo `org_id is null`
--
-- O WITH CHECK aceitava `org_id is null`, mas o USING da mesma policy não —
-- ou seja, era possível criar uma linha que ninguém (nem quem a criou) voltava
-- a ver: um buraco negro de dados, e uma linha sem inquilino definido numa
-- tabela multi-org. Produção tem 0 linhas assim, logo apertar é seguro.
--
-- (As funções definer não são afectadas: correm como owner e a tabela não tem
-- FORCE ROW LEVEL SECURITY.)
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "rls_org_isolation" on public.notificacoes;
create policy "rls_org_isolation" on public.notificacoes
  as restrictive for all to authenticated
  using (org_id = get_current_org_id())
  with check (org_id = get_current_org_id());

drop policy if exists "rls_org_isolation" on public.email_sends;
create policy "rls_org_isolation" on public.email_sends
  as restrictive for all to authenticated
  using (org_id = get_current_org_id())
  with check (org_id = get_current_org_id());

-- A policy permissiva de leitura tinha `(org_id is null or org_id = ...)`.
-- Era código morto — a restritiva já exigia a igualdade — mas dava a ler que
-- notificações sem org eram visíveis a todos, que é o oposto do desejado.
-- Recriada sem esse ramo, para que a intenção se leia no próprio SQL.
drop policy if exists "ver notificacoes do meu cargo" on public.notificacoes;
create policy "ver notificacoes do meu cargo" on public.notificacoes
for select using (
  org_id = get_current_org_id()
  and (
    (tipo = 'motorista_pendente' and (is_current_user_admin() or current_user_cargo() = any (array['Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE'])))
    or (tipo = any (array['escalonamento', 'pedido_troca_kms']) and (is_current_user_admin() or current_user_cargo() = 'Supervisor Gestor TVDE'))
    or (
      tipo = any (array[
        'viatura_disponivel', 'recibo_anulado', 'viatura_seguro_expirando',
        'viatura_inspecao_expirando', 'motorista_carta_expirando',
        'motorista_licenca_tvde_expirando', 'cobranca_gerada', 'utilizador_criado',
        'contrato_renting_renovacao_proxima', 'sistema_limite_email_atingido',
        'sistema_job_falhou', 'contrato_renting_criado', 'motorista_candidatura_parada',
        'contrato_renting_sem_checkin', 'viatura_extintor_expirando', 'viatura_iuc_a_pagar',
        'viatura_manutencao_preventiva_expirando', 'motorista_reparacao_cobranca',
        'assistencia_ticket_aberto_demasiado_tempo', 'motorista_ficha_incompleta',
        'invoice_nao_enviada_ao_cliente', 'seguranca_login_suspeito'
      ])
      and destinatario_id = auth.uid()
    )
  )
);
