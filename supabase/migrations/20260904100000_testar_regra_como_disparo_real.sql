-- ============================================================================
-- O "Testar" passa a ser um disparo real, não uma simulação para o próprio
-- ============================================================================
--
-- A primeira versão enviava só para quem carregava no botão e devolvia, à
-- parte, uma lista de quem receberia "a sério". Duas consequências más:
--
--   1. Não testava o que interessa. Quem põe um email avulso quer confirmar
--      que AQUELE endereço recebe — e era precisamente esse que nunca recebia.
--   2. A lista de destinatários era uma CÓPIA de leitura da resolução do
--      executor. As duas divergiram assim que o fallback de admin saiu das
--      acções de email (20260904093000), e o toast passou a prometer pessoas
--      que já não recebiam.
--
-- Agora a função cria um `automation_runs` verdadeiro — com a definição
-- ACTUAL da regra congelada, como process_domain_events faz — e chama o
-- executor de produção. Destinatários, notificações e fila de email passam a
-- ser decididos num sítio só. O teste deixa de poder mentir, porque deixou de
-- ter opinião própria.
--
-- Em troca: um teste é uma execução a sério. Conta nas estatísticas da
-- automação e o email chega mesmo a quem está configurado, incluindo
-- endereços externos. É o que foi pedido, e o cooldown de 30s por regra
-- continua a ser o travão contra cliques repetidos.
-- ============================================================================

create or replace function public.testar_regra_automacao(p_rule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rule public.automation_rules;
  v_ultimo_run record;
  v_cooldown record;
  v_restante interval;
  v_intervalo constant interval := interval '30 seconds';
  v_run_id uuid;
  v_status text;
  v_erro text;
  v_notif_count int;
  v_fila_count int;
begin
  if not (is_current_user_admin() or can_edit(auth.uid(), 'automacoes')) then
    raise exception 'Sem permissão para testar automações.';
  end if;

  select * into v_rule
  from public.automation_rules
  where id = p_rule_id
    and org_id = get_current_org_id();

  if v_rule.id is null then
    raise exception 'Regra não encontrada.';
  end if;

  if v_rule.acao_tipo not in ('notificacao', 'email') then
    raise exception 'Só é possível testar acções de notificação ou email.';
  end if;

  select * into v_cooldown
  from public.automacao_regra_teste_cooldown
  where rule_id = p_rule_id
  for update;

  if v_cooldown.ultimo_teste_em is not null and now() - v_cooldown.ultimo_teste_em < v_intervalo then
    v_restante := v_intervalo - (now() - v_cooldown.ultimo_teste_em);
    raise exception 'Já testaste esta automação há pouco — aguarda mais % antes de repetir.', to_char(v_restante, 'MI:SS');
  end if;

  -- Os dados vêm do último disparo real desta regra: tokens preenchidos com
  -- valores verdadeiros, não inventados.
  select payload, entity_table, entity_id
  into v_ultimo_run
  from public.automation_runs
  where rule_id = p_rule_id
  order by created_at desc, id desc
  limit 1;

  if v_ultimo_run.payload is null then
    raise exception 'Esta automação ainda não correu — não há dados para testar.';
  end if;

  insert into public.automacao_regra_teste_cooldown (rule_id, ultimo_teste_em, testado_por)
  values (p_rule_id, now(), auth.uid())
  on conflict (rule_id) do update set ultimo_teste_em = now(), testado_por = auth.uid();

  -- Um run como qualquer outro. `rule_snapshot` congela a definição ACTUAL —
  -- é isso que faz o teste medir a configuração que está no ecrã, e não a que
  -- estava quando a automação disparou pela última vez.
  -- `automation_runs` não guarda event_type: o executor lê-o do snapshot da
  -- regra (v_rule.event_type), que é onde a definição congelada vive.
  insert into public.automation_runs (
    org_id, rule_id, entity_table, entity_id, payload, status, rule_snapshot
  )
  values (
    v_rule.org_id,
    v_rule.id,
    v_ultimo_run.entity_table,
    v_ultimo_run.entity_id,
    v_ultimo_run.payload,
    'pending',
    jsonb_build_object('regra', to_jsonb(v_rule))
  )
  returning id into v_run_id;

  -- O executor de produção, sem atalhos. Reclama até 20 runs pendentes, por
  -- isso pode apanhar outros pelo caminho — que o cron apanharia na mesma.
  perform public.execute_automation_runs();

  select status, error_message into v_status, v_erro
  from public.automation_runs
  where id = v_run_id;

  select count(*) into v_notif_count
  from public.notifications
  where rule_run_id = v_run_id;

  select count(*) into v_fila_count
  from public.notification_queue q
  join public.notifications n on n.id = q.notification_id
  where n.rule_run_id = v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id,
    -- 'pending' significa que o lote encheu antes de chegar a este run; sai
    -- no ciclo seguinte do cron. Não é falha, e o frontend di-lo assim.
    'status', v_status,
    'erro', v_erro,
    'notificacoes_criadas', v_notif_count,
    'emails_enfileirados', v_fila_count,
    'destinatarios', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', coalesce(n.destinatario_email_externo, u.email),
               'nome', coalesce(p.nome, n.destinatario_email_externo)
             ) order by coalesce(n.destinatario_email_externo, u.email)), '[]'::jsonb)
      from public.notifications n
      left join auth.users u on u.id = n.destinatario_user_id
      left join public.profiles p on p.id = n.destinatario_user_id
      where n.rule_run_id = v_run_id
    )
  );
end;
$function$;

revoke all on function public.testar_regra_automacao(uuid) from public, anon;
grant execute on function public.testar_regra_automacao(uuid) to authenticated;
