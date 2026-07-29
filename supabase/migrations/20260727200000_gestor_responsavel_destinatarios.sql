-- Motor de Automação — restringe destinatários ao gestor responsável em
-- vez de transmitir a todos os que têm o recurso RBAC. Encontrado ao
-- testar contra dados reais em produção: 2.106 notificações para 81
-- eventos de IPO (26 destinatários por evento) — ruído, não sinal.
--
-- gestor_responsavel é texto (nome), resolvido por
-- lower(btrim(nome)) = lower(btrim(profiles.nome)), org-scoped — o
-- mesmo padrão já em produção em fn_recibo_anulado_avisos()
-- (20260707140000_recibo_anulado_avisos.sql). viaturas não tem esta
-- coluna — resolve-se via o motorista atualmente atribuído
-- (motorista_viaturas ativo). Sem gestor resolvido, cai para admins.
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-gestor-responsavel.md.

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

      -- Uma só query/loop: se o gestor resolveu, notifica só essa pessoa;
      -- caso contrário, aplica o fallback (admins, mais o recurso RBAC
      -- quando a estratégia é 'recurso').
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

        if v_enviar_email and v_destinatario.email is not null then
          insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
          values (v_notification_id, v_run.org_id, 'email', v_destinatario.email, v_rule.acao_config->>'template_codigo', v_run.payload);
        end if;
      end loop;

      perform public.automation_runs_complete(v_run.id);
    exception when others then
      perform public.automation_runs_fail(v_run.id, sqlerrm);
    end;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- seed_automacao_defaults(): as 4 regras por-omissão passam a usar a
-- estratégia gestor_responsavel (com fallback a admins já embutido
-- no executor acima).

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
    )
  on conflict (codigo, org_id) do nothing;
end;
$$;

-- Backfill: as 20 regras já semeadas (5 orgs x 4) passam a ter a
-- estratégia gestor_responsavel também.
update public.automation_rules
set acao_config = acao_config || jsonb_build_object('destinatarios_estrategia', 'gestor_responsavel')
where codigo in ('viatura.seguro_expirando', 'viatura.inspecao_expirando', 'motorista.carta_expirando', 'motorista.licenca_tvde_expirando');

revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;
revoke all on function public.seed_automacao_defaults(uuid) from public, anon, authenticated, service_role;
