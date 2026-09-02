-- ============================================================================
-- Uma acção de email obedece aos destinatários escolhidos — sem admins por fora
-- ============================================================================
--
-- O laço geral de resolução de destinatários sempre incluiu os
-- administradores da organização, escolhessem-se cargos ou não. Isso é a rede
-- de segurança do aviso NA APLICAÇÃO: alguém tem de ver o alerta.
--
-- Para email, o mesmo comportamento é outra coisa. Um painel que diz
-- "Grupos que recebem: ninguém escolhido" e mesmo assim manda 13 emails não
-- é uma rede de segurança — é uma surpresa. Com endereços externos ao lado
-- (fornecedores, clientes), ainda menos defensável.
--
-- A partir daqui: `notificacao` mantém o fallback de admin exactamente como
-- estava; `email` vai só para os cargos/pessoas/endereços escolhidos.
--
-- Efeito colateral aceite: uma acção de email sem destinatários nenhuns
-- deixa de ir a lado nenhum. Fica registado no detalhe do run
-- (`sem_destinatarios`) em vez de desaparecer em silêncio — falhar o run
-- seria pior, porque não há aqui nada de partido.
-- ============================================================================

do $$
declare
  v_src  text;
  v_novo text;
  -- (1) O ramo do admin no laço geral.
  v_admin_de constant text := E'              and (\n                uo.is_admin = true\n                or (';
  v_admin_para constant text := E'              and (\n                -- O fallback de admin é a rede de segurança do aviso NA\n                -- APLICAÇÃO. Numa acção de email, avisar todos os\n                -- administradores quando ninguém foi escolhido é intrusivo.\n                (uo.is_admin = true and v_rule.acao_tipo <> ''email'')\n                or (';
  -- (2) O detalhe final do ramo geral — passa a registar a ausência de
  -- destinatários, que antes era impossível (os admins tapavam-na sempre).
  v_detalhe_de constant text := E'      perform public.automation_runs_complete(\n        v_run.id,\n        jsonb_build_object(''notificacoes_criadas'', v_notif_count, ''emails_enviados'', v_email_count)\n      );\n    exception when others then';
  v_detalhe_para constant text := E'      perform public.automation_runs_complete(\n        v_run.id,\n        jsonb_build_object(\n          ''notificacoes_criadas'', v_notif_count,\n          ''emails_enviados'', v_email_count,\n          -- Sem isto, uma acção de email sem ninguém escolhido concluía com\n          -- zeros e sem explicação nenhuma de porquê.\n          ''sem_destinatarios'', v_notif_count = 0\n        )\n      );\n    exception when others then';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname = 'execute_automation_runs';

  if v_src is null then
    raise exception 'execute_automation_runs não existe — cadeia fora de ordem';
  end if;

  v_novo := replace(v_src, v_admin_de, v_admin_para);

  if v_novo = v_src then
    raise exception 'Cirurgia no fallback de admin não casou.'
      using hint = 'Comparar com pg_get_functiondef. Nada foi alterado.';
  end if;

  v_novo := replace(v_novo, v_detalhe_de, v_detalhe_para);

  if v_novo not like '%sem_destinatarios%' then
    raise exception 'Cirurgia no detalhe do run não casou.'
      using hint = 'O primeiro replace passou, este não. Nada foi alterado.';
  end if;

  -- Pós-condições: o guarda entrou, e o fallback de admin do ramo do
  -- gestor_responsavel (que é sobre notificações) não foi tocado.
  if v_novo not like '%uo.is_admin = true and v_rule.acao_tipo <> ''email''%' then
    raise exception 'O guarda de acao_tipo não ficou no ramo do admin.';
  end if;

  execute v_novo;
end $$;

revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;
