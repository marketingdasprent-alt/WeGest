-- ============================================================================
-- O executor resolve destinatarios_emails_livres
-- ============================================================================
--
-- Três substituições, não uma reescrita: execute_automation_runs tem >300
-- linhas e uma reescrita já lhe perdeu comportamento antes (ver a nota na
-- migração 20260826142309). O padrão é o mesmo das Fases 2-4: replace()
-- asserido, raise exception se não casar.
--
-- Só se aplica no ramo geral (destinatarios_estrategia = 'cargo' ou
-- ausente) — 'motorista' e 'gestor_responsavel' saem mais cedo (continue) e
-- o editor visual nunca os produz. Ver a spec, secção 4.
-- ============================================================================

do $$
declare
  v_src   text;
  v_novo  text;
  v_antes text;
  v_pares text[][] := array[
    -- (a) duas variáveis novas, junto das que já resolvem cargo/utilizador
    array[
      E'  v_user_ids uuid[];\n  v_modo text;',
      E'  v_user_ids uuid[];\n  v_emails_livres text[];\n  v_email_externo text;\n  v_modo text;'
    ],
    -- (b) popular o array a partir da config, junto de v_user_ids
    array[
      E'      v_user_ids := array(\n        select jsonb_array_elements_text(coalesce(v_rule.acao_config->''destinatarios_user_ids'', ''[]''::jsonb))::uuid\n      );',
      E'      v_user_ids := array(\n        select jsonb_array_elements_text(coalesce(v_rule.acao_config->''destinatarios_user_ids'', ''[]''::jsonb))::uuid\n      );\n      v_emails_livres := array(\n        select jsonb_array_elements_text(coalesce(v_rule.acao_config->''destinatarios_emails_livres'', ''[]''::jsonb))\n      );'
    ],
    -- (c) o ramo de resolução novo, antes do automation_runs_complete final do
    -- ramo geral
    array[
      E'      end loop;\n\n      perform public.automation_runs_complete(\n        v_run.id,\n        jsonb_build_object(''notificacoes_criadas'', v_notif_count, ''emails_enviados'', v_email_count)\n      );\n    exception when others then',
      E'      end loop;\n\n      -- Endereços externos: texto solto, sem auth.users nem\n      -- user_organizacoes por trás. Só faz sentido numa acção de email —\n      -- o validador já garante que a chave nunca aparece numa notificação.\n      if v_rule.acao_tipo = ''email'' then\n        foreach v_email_externo in array v_emails_livres loop\n          insert into public.notifications (org_id, destinatario_email_externo, template_codigo, titulo, payload, entity_table, entity_id, rule_run_id, link)\n          values (\n            v_run.org_id,\n            v_email_externo,\n            v_rule.acao_config->>''template_codigo'',\n            coalesce(v_rule.acao_config->>''titulo'', v_rule.nome),\n            v_run.payload,\n            v_run.entity_table,\n            v_run.entity_id,\n            v_run.id,\n            v_link\n          )\n          on conflict (rule_run_id, destinatario_email_externo) where rule_run_id is not null and destinatario_email_externo is not null\n          do update set rule_run_id = notifications.rule_run_id\n          returning id into v_notification_id;\n          v_notif_count := v_notif_count + 1;\n\n          insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)\n          values (v_notification_id, v_run.org_id, ''email'', v_email_externo, v_rule.acao_config->>''template_codigo'', v_run.payload)\n          on conflict (notification_id, canal, destinatario) do nothing;\n          v_email_count := v_email_count + 1;\n        end loop;\n      end if;\n\n      perform public.automation_runs_complete(\n        v_run.id,\n        jsonb_build_object(''notificacoes_criadas'', v_notif_count, ''emails_enviados'', v_email_count)\n      );\n    exception when others then'
    ]
  ];
  i int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname = 'execute_automation_runs';

  if v_src is null then
    raise exception 'execute_automation_runs não existe — cadeia fora de ordem';
  end if;

  v_novo := v_src;
  for i in 1 .. array_length(v_pares, 1) loop
    v_antes := v_novo;
    v_novo := replace(v_novo, v_pares[i][1], v_pares[i][2]);
    if v_novo = v_antes then
      raise exception 'Cirurgia %/% no executor (emails livres) não casou.', i, array_length(v_pares, 1)
        using hint = 'Comparar com pg_get_functiondef. Nada foi alterado.';
    end if;
  end loop;

  execute v_novo;
end $$;

revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;
