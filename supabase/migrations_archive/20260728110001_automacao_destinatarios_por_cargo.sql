-- Substitui a estratégia de destinatários "recurso" (permissão como proxy
-- indireto) por "cargo" (seleção direta de 1+ grupos/cargos). A estratégia
-- gestor_responsavel não muda.

-- 1) Traduz regras já configuradas: para cada uma efetivamente em
--    estratégia 'recurso' (a chave pode estar ausente — a função lê com
--    default 'recurso', por isso coalesce(...,'recurso') = 'recurso'
--    apanha as duas situações), calcula os cargos que hoje têm essa
--    permissão (cargo_permissoes.tem_acesso=true, mesmo org_id) e
--    grava-os como destinatarios_cargo_ids — ninguém deixa de receber o
--    que já recebia.
do $$
declare
  v_rule record;
  v_cargo_ids jsonb;
begin
  for v_rule in
    select id, org_id, acao_config
    from public.automation_rules
    where coalesce(acao_config->>'destinatarios_estrategia', 'recurso') = 'recurso'
      and coalesce(acao_config->>'destinatarios_recurso', '') <> ''
  loop
    select coalesce(jsonb_agg(cp.cargo_id), '[]'::jsonb)
    into v_cargo_ids
    from public.cargo_permissoes cp
    join public.recursos r on r.id = cp.recurso_id
    where r.nome = v_rule.acao_config->>'destinatarios_recurso'
      and cp.tem_acesso = true
      and cp.org_id = v_rule.org_id;

    update public.automation_rules
    set acao_config = (v_rule.acao_config - 'destinatarios_recurso')
      || jsonb_build_object(
           'destinatarios_estrategia', 'cargo',
           'destinatarios_cargo_ids', v_cargo_ids
         )
    where id = v_rule.id;
  end loop;

  -- Limpeza: qualquer regra que ainda tenha destinatarios_recurso (ex.: as
  -- de estratégia gestor_responsavel que tinham lá um valor nunca lido em
  -- runtime) perde essa chave morta — o campo deixa de existir no tipo.
  update public.automation_rules
  set acao_config = acao_config - 'destinatarios_recurso'
  where acao_config ? 'destinatarios_recurso';
end $$;

-- 2) Redefine execute_automation_runs(): troca a resolução por recurso
--    (EXISTS sobre cargo_permissoes/recursos) pela resolução direta por
--    cargo_id. Corpo completo repetido (create or replace), como já é
--    costume neste projeto.
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

      v_cargo_ids := array(
        select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_cargo_ids', '[]'::jsonb))::uuid
      );
      v_enviar_email := coalesce((v_rule.acao_config->>'enviar_email')::boolean, false);
      v_enviar_email_digest := coalesce((v_rule.acao_config->>'enviar_email_digest')::boolean, false);
      v_estrategia := coalesce(v_rule.acao_config->>'destinatarios_estrategia', 'cargo');
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
                  v_estrategia = 'cargo'
                  and uo.cargo_id is not null
                  and uo.cargo_id = any(v_cargo_ids)
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
