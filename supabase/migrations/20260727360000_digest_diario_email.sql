-- Incidente real: contrato_renting.renovacao_proxima mandou 1764 emails
-- num dia para 21 pessoas (~84 cada) — um email por contrato, sem
-- nenhum agrupamento, quando um backlog de 84 contratos foi processado
-- de uma vez. Este ficheiro fecha a causa raiz: regras marcadas com
-- acao_config.enviar_email_digest=true deixam de enfileirar email
-- imediato por notificação — em vez disso, um job diário agrupa tudo o
-- que cada destinatário tem pendente num ÚNICO email de resumo.

-- 1. Rastreio de quais notificações já foram incluídas num digest.
alter table public.notifications
  add column if not exists digest_enviado_em timestamptz;

-- 2. execute_automation_runs(): não enfileirar email imediato quando a
--    regra pede modo digest (a notificação interna continua normal).
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
  v_enviar_email_digest boolean;
  v_estrategia text;
  v_gestor_nome text;
  v_gestor_user_id uuid;
  v_notif_count integer;
  v_email_count integer;
  v_tipo_legado text;
  v_link text;
  v_viatura_id uuid;
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
      v_enviar_email_digest := coalesce((v_rule.acao_config->>'enviar_email_digest')::boolean, false);
      v_estrategia := coalesce(v_rule.acao_config->>'destinatarios_estrategia', 'recurso');
      v_gestor_nome := null;
      v_gestor_user_id := null;
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
        else null
      end;

      v_viatura_id := case when v_run.entity_table = 'viaturas' then v_run.entity_id else null end;
      v_link := case v_run.entity_table
        when 'viaturas' then '/viaturas/' || v_run.entity_id::text
        when 'motoristas_ativos' then '/motoristas/' || v_run.entity_id::text
        when 'contratos_renting' then '/renting/contratos/' || v_run.entity_id::text
        when 'profiles' then '/admin/utilizadores'
        else null
      end;

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

        -- Modo digest: NÃO enfileira email já — enviar_digests_diarios()
        -- trata disto mais tarde, agrupado por destinatário.
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

-- 3. Job diário: agrupa por (org, destinatário) tudo o que ainda não foi
--    incluído num digest, cria UMA notificação+email de resumo, e marca
--    as originais como já tratadas.
create or replace function public.enviar_digests_diarios()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo record;
  v_notification_id uuid;
begin
  for v_grupo in
    select
      n.org_id,
      n.destinatario_user_id,
      u.email,
      count(*)::int as total,
      array_agg(n.id) as notif_ids,
      string_agg(n.titulo || coalesce(': ' || n.mensagem, ''), '<br>' order by n.created_at) as lista_html
    from public.notifications n
    join public.automation_runs r on r.id = n.rule_run_id
    join public.automation_rules ar on ar.id = r.rule_id
    join auth.users u on u.id = n.destinatario_user_id
    where n.digest_enviado_em is null
      and coalesce((ar.acao_config->>'enviar_email_digest')::boolean, false) = true
    group by n.org_id, n.destinatario_user_id, u.email
  loop
    if v_grupo.email is null then
      continue;
    end if;

    insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo, mensagem, payload)
    values (
      v_grupo.org_id,
      v_grupo.destinatario_user_id,
      'digest.resumo_diario',
      'Resumo diário de automações',
      v_grupo.total || ' aviso(s) novo(s)',
      jsonb_build_object('total', v_grupo.total, 'lista', v_grupo.lista_html)
    )
    returning id into v_notification_id;

    insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
    values (
      v_notification_id,
      v_grupo.org_id,
      'email',
      v_grupo.email,
      'digest.resumo_diario',
      jsonb_build_object('total', v_grupo.total, 'lista', v_grupo.lista_html)
    );

    update public.notifications
    set digest_enviado_em = now()
    where id = any(v_grupo.notif_ids);
  end loop;
end;
$$;

revoke all on function public.enviar_digests_diarios() from public, anon, authenticated;
grant execute on function public.enviar_digests_diarios() to service_role, authenticated;

select cron.schedule(
  'automation-enviar-digests-diarios',
  '0 9 * * *',
  $$select public.enviar_digests_diarios()$$
);

-- 4. seed_automacao_defaults(): contrato_renting.renovacao_proxima passa
--    a modo digest (enviar_email=true + enviar_email_digest=true) em vez
--    de enviar_email=false (estava desligado desde o incidente de hoje).
--    Novo template de email do digest.
create or replace function public.seed_automacao_defaults(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config, cooldown_minutos)
  values
    (
      p_org_id, 'viatura.seguro_expirando', 'Seguro de viatura a expirar', 'viatura.seguro_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.seguro_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Seguro de viatura a expirar'),
      1440
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'Inspeção periódica (IPO) a expirar', 'viatura.inspecao_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.inspecao_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Inspeção periódica (IPO) a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'Carta de condução do motorista a expirar', 'motorista.carta_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.carta_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Carta de condução do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'Licença TVDE do motorista a expirar', 'motorista.licenca_tvde_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.licenca_tvde_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Licença TVDE do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'cobranca.gerada', 'Nova cobrança gerada — pronta a emitir', 'cobranca.gerada', 'notificacao',
      jsonb_build_object('template_codigo', 'cobranca.gerada', 'destinatarios_recurso', 'renting_contratos', 'enviar_email', false, 'titulo', 'Nova cobrança gerada'),
      0
    ),
    (
      p_org_id, 'utilizador.criado', 'Novo utilizador criado', 'utilizador.criado', 'notificacao',
      jsonb_build_object('template_codigo', 'utilizador.criado', 'destinatarios_recurso', 'admin_utilizadores', 'enviar_email', false, 'titulo', 'Novo utilizador criado'),
      0
    ),
    (
      p_org_id, 'contrato_renting.renovacao_proxima', 'Contrato de renting a atingir data de renovação', 'contrato_renting.renovacao_proxima', 'notificacao',
      jsonb_build_object('template_codigo', 'contrato_renting.renovacao_proxima', 'destinatarios_recurso', 'renting_contratos', 'enviar_email', true, 'enviar_email_digest', true, 'titulo', 'Contrato a renovar'),
      1440
    )
  on conflict (codigo, org_id) do nothing;

  insert into public.notification_templates (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, variaveis_esperadas)
  values
    (
      p_org_id, 'viatura.seguro_expirando', 'email', 'pt-PT',
      'Seguro da viatura {{matricula}} a expirar',
      'O seguro da viatura {{matricula}} expira em {{seguro_validade}}. Confirma se a renovação já está tratada.',
      'text', array['matricula', 'seguro_validade']
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'email', 'pt-PT',
      'Inspeção periódica (IPO) da viatura {{matricula}} a expirar',
      'A inspeção periódica (IPO) da viatura {{matricula}} expira em {{inspecao_validade}}. Agenda a inspeção antes da data.',
      'text', array['matricula', 'inspecao_validade']
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'email', 'pt-PT',
      'Carta de condução de {{nome}} a expirar',
      'A carta de condução de {{nome}} expira em {{carta_validade}}. Confirma que a renovação está a ser tratada antes de atribuir novos contratos.',
      'text', array['nome', 'carta_validade']
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'email', 'pt-PT',
      'Licença TVDE de {{nome}} a expirar',
      'A licença TVDE de {{nome}} expira em {{licenca_tvde_validade}}. Confirma que a renovação está a ser tratada antes de atribuir novos contratos.',
      'text', array['nome', 'licenca_tvde_validade']
    ),
    (
      p_org_id, 'contrato_renting.renovacao_proxima', 'email', 'pt-PT',
      'Contrato {{codigo}} ({{matricula}}) a atingir a data de renovação',
      'O contrato de renting nº {{codigo}} de {{cliente_nome}} (viatura {{matricula}}) atinge a data de renovação em {{prazo}}. Confirma se a renovação já foi preparada.',
      'text', array['codigo', 'matricula', 'cliente_nome', 'prazo']
    ),
    (
      p_org_id, 'digest.resumo_diario', 'email', 'pt-PT',
      'Resumo diário — {{total}} aviso(s) novo(s)',
      'Tens {{total}} aviso(s) novo(s) hoje:<br><br>{{lista}}',
      'html', array['total', 'lista']
    )
  on conflict (codigo, canal, idioma, versao, org_id) do nothing;
end;
$$;

-- 5. Backfill: religa o email de contrato_renting.renovacao_proxima (fica
--    em modo digest desta vez), e semeia o template do digest para orgs
--    já existentes.
update public.automation_rules
set acao_config = jsonb_set(
  jsonb_set(acao_config, '{enviar_email}', 'true'::jsonb),
  '{enviar_email_digest}', 'true'::jsonb
)
where event_type = 'contrato_renting.renovacao_proxima';

do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizacoes loop
    perform public.seed_automacao_defaults(v_org.id);
  end loop;
end;
$$;

-- 6. Botão "Correr agora": passa a correr também o digest, para o teste
--    manual refletir o comportamento real (agrupado), não o antigo.
create or replace function public.executar_jobs_automacao_manualmente()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock public.automacao_execucao_manual_lock;
  v_intervalo constant interval := interval '5 minutes';
  v_restante interval;
begin
  if not (is_current_user_admin() or can_edit(auth.uid(), 'automacoes')) then
    raise exception 'Sem permissão para correr as automações manualmente.';
  end if;

  select * into v_lock from public.automacao_execucao_manual_lock for update;

  if v_lock.ultima_execucao_em is not null and now() - v_lock.ultima_execucao_em < v_intervalo then
    v_restante := v_intervalo - (now() - v_lock.ultima_execucao_em);
    raise exception 'Já correu há pouco — aguarda mais % antes de repetir.', to_char(v_restante, 'MI:SS');
  end if;

  update public.automacao_execucao_manual_lock
  set ultima_execucao_em = now(), executado_por = auth.uid()
  where id = true;

  perform public.emit_expiry_events();
  perform public.emit_contrato_renting_renovacao_events();
  perform public.emit_lembretes_cobranca_atrasada();
  perform public.process_domain_events();
  perform public.execute_automation_runs();
  perform public.enviar_digests_diarios();

  return jsonb_build_object('success', true, 'executado_em', now());
end;
$$;

revoke all on function public.executar_jobs_automacao_manualmente() from public, anon;
grant execute on function public.executar_jobs_automacao_manualmente() to authenticated;
