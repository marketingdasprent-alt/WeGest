-- Motor de Automação — fecha I1/I2 do MVP original, mas só como aviso
-- interno: o utilizador decidiu explicitamente NÃO automatizar a emissão
-- fiscal (faturacao-emitir/KeyInvoice) nem o envio de email ao cliente
-- (send-documento-fiscal-email) — isso continua manual, como hoje. O que
-- a automação faz é avisar quem gere contratos de renting assim que uma
-- cobrança nasce, para não depender de alguém se lembrar de abrir a
-- lista. cobranca.gerada já publica em domain_events desde
-- 20260727180000_cobranca_gerada_domain_event.sql — faltava só uma regra
-- a consumi-lo.

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
      jsonb_build_object('template_codigo', 'viatura.seguro_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', false, 'titulo', 'Seguro de viatura a expirar'),
      1440
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'Inspeção periódica (IPO) a expirar', 'viatura.inspecao_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.inspecao_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', false, 'titulo', 'Inspeção periódica (IPO) a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'Carta de condução do motorista a expirar', 'motorista.carta_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.carta_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', false, 'titulo', 'Carta de condução do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'Licença TVDE do motorista a expirar', 'motorista.licenca_tvde_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.licenca_tvde_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', false, 'titulo', 'Licença TVDE do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'cobranca.gerada', 'Nova cobrança gerada — pronta a emitir', 'cobranca.gerada', 'notificacao',
      jsonb_build_object('template_codigo', 'cobranca.gerada', 'destinatarios_recurso', 'renting_contratos', 'enviar_email', false, 'titulo', 'Nova cobrança gerada'),
      0
    )
  on conflict (codigo, org_id) do nothing;
end;
$$;

-- Backfill: organizações já existentes ganham a regra nova (idempotente
-- por causa do on conflict acima — não duplica as 4 já seedadas).
do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizacoes loop
    perform public.seed_automacao_defaults(v_org.id);
  end loop;
end;
$$;

-- Dupla escrita: cobranca.gerada passa a ter tipo mapeado em notificacoes
-- (tabela antiga, lida pelo sino/popup real) também.
alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo = any (array[
    'motorista_pendente', 'escalonamento', 'viatura_disponivel', 'pedido_troca_kms', 'recibo_anulado',
    'viatura_seguro_expirando', 'viatura_inspecao_expirando', 'motorista_carta_expirando', 'motorista_licenca_tvde_expirando',
    'cobranca_gerada'
  ]::text[]));

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
  v_tipo_legado text;
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

      v_tipo_legado := case v_rule.event_type
        when 'viatura.seguro_expirando' then 'viatura_seguro_expirando'
        when 'viatura.inspecao_expirando' then 'viatura_inspecao_expirando'
        when 'motorista.carta_expirando' then 'motorista_carta_expirando'
        when 'motorista.licenca_tvde_expirando' then 'motorista_licenca_tvde_expirando'
        when 'cobranca.gerada' then 'cobranca_gerada'
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
          insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade, destinatario_user_id)
          values (
            v_run.org_id,
            v_tipo_legado,
            coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
            null,
            'normal',
            v_destinatario.user_id
          );
        end if;

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
