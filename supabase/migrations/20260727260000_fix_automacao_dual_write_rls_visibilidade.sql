-- Corrige um bug real na dupla escrita da automação para `notificacoes`
-- (introduzida em 20260727240000/20260727250000): o INSERT usava
-- destinatario_user_id, uma coluna substituída por destinatario_id desde
-- 20260629000004_lista_espera_viatura_disponivel.sql — RLS de SELECT e
-- resolver_notificacao já só olham para destinatario_id. Além disso, nunca
-- existiu um ramo de RLS para os 5 tipos novos (viatura_seguro_expirando,
-- viatura_inspecao_expirando, motorista_carta_expirando,
-- motorista_licenca_tvde_expirando, cobranca_gerada).
--
-- Resultado: as notificações eram escritas mas NUNCA visíveis no sino/popup
-- real (useNotificacoes.ts lê `notificacoes` filtrado só pela RLS, sem
-- filtro de destinatário no cliente) — o próprio objetivo da dupla escrita
-- falhava silenciosamente. O teste pgTAP existente não apanhava isto por
-- nunca simular a leitura de um utilizador autenticado através da policy.
--
-- Ver [[project-automacao-dual-write-rls-bug]].

-- 1. execute_automation_runs(): escrever destinatario_id, não destinatario_user_id.
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
          insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade, destinatario_id)
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

-- 2. RLS: os 5 tipos novos passam a ter ramo de visibilidade, no mesmo
--    padrão de 'viatura_disponivel'/'recibo_anulado' (destinatario_id =
--    auth.uid()). Consolida-se num único ramo por partilharem o mesmo
--    predicado, em vez de repetir a condição 7 vezes.
drop policy if exists "ver notificacoes do meu cargo" on public.notificacoes;
create policy "ver notificacoes do meu cargo" on public.notificacoes
  for select to public
  using (
    ((org_id is null) or (org_id = get_current_org_id()))
    and (
      ((tipo = 'motorista_pendente')
        and (is_current_user_admin()
          or (current_user_cargo() = any (array['Gestor TVDE','Administrador','Supervisor Gestor TVDE']))))
      or ((tipo = any (array['escalonamento','pedido_troca_kms']))
        and (is_current_user_admin()
          or (current_user_cargo() = 'Supervisor Gestor TVDE')))
      or (
        (tipo = any (array[
          'viatura_disponivel',
          'recibo_anulado',
          'viatura_seguro_expirando',
          'viatura_inspecao_expirando',
          'motorista_carta_expirando',
          'motorista_licenca_tvde_expirando',
          'cobranca_gerada'
        ]))
        and (destinatario_id = auth.uid())
      )
    )
  );
