-- ============================================================================
-- Duas correcções que a acção de email obriga, antes de ela existir
-- ============================================================================
--
-- Nenhuma das duas muda comportamento hoje: não há regras `email`. Entram em
-- separado para que, se alguma coisa correr mal, se saiba qual das duas foi.
--
-- ── 1. A SUPRESSÃO MATARIA OS EMAILS ────────────────────────────────────────
--
-- `process_domain_events` salta uma regra quando já há um aviso não resolvido
-- para aquela entidade. Medido a 2026-08-31, últimas 24h:
--
--     ignorada_aviso_em_aberto   354
--     executada                   43
--
-- É o caminho dominante. E é avaliado POR REGRA, dentro de um laço sem
-- ORDER BY. Assim que existirem duas regras para o mesmo evento — uma que
-- notifica e outra que envia email — a de email passa a ser suprimida pelo
-- aviso que a de notificação acabou de criar. Como a ordem não é definida, às
-- vezes o email sairia e às vezes não: não determinista, e a falha é silêncio.
--
-- A supressão existe para não repetir o aviso NA APLICAÇÃO. Para o email o
-- travão é o cooldown, que a regra gémea traz igual.
--
-- ── 2. O TRIGGER CANCELARIA TODAS AS LINHAS DE EMAIL ────────────────────────
--
-- `fn_notifications_so_quando_ha_email` cancela a linha de `notifications`
-- quando a config da regra diz `enviar_email = false`. Uma regra de email não
-- tem esse campo, logo o `coalesce(..., false)` daria false e TODAS as linhas
-- seriam canceladas — sem erro, sem registo.
--
-- Passa a decidir primeiro pelo `acao_tipo`, e só depois pelo campo antigo,
-- que ainda existe enquanto houver regras por migrar.
-- ============================================================================

-- ── 1. Supressão só para notificações ───────────────────────────────────────
do $$
declare
  v_src  text;
  v_novo text;
  v_proc constant text := E'        if v_tipo_legado is not null and v_link is not null then\n          if exists (';
  v_sub  constant text := E'        -- A supressão é sobre o aviso NA APLICAÇÃO: uma regra que só envia\n        -- email não repete aviso nenhum, e o seu travão é o cooldown.\n        if v_rule.acao_tipo = ''notificacao'' and v_tipo_legado is not null and v_link is not null then\n          if exists (';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname = 'process_domain_events';

  if v_src is null then
    raise exception 'process_domain_events não existe — cadeia fora de ordem';
  end if;

  v_novo := replace(v_src, v_proc, v_sub);

  if v_novo = v_src then
    raise exception 'Cirurgia na supressão não casou.'
      using hint = 'Comparar com pg_get_functiondef. Nada foi alterado.';
  end if;

  if v_novo not like '%v_rule.acao_tipo = ''notificacao'' and v_tipo_legado%' then
    raise exception 'A supressão ficou sem o guarda de acao_tipo.';
  end if;

  execute v_novo;
end $$;

revoke all on function public.process_domain_events(integer) from public, anon, authenticated;
grant execute on function public.process_domain_events(integer) to service_role;

-- ── 2. O trigger decide pelo tipo da acção, não por um campo da config ──────
create or replace function public.fn_notifications_so_quando_ha_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tipo   text;
  v_config jsonb;
begin
  -- Alertas técnicos directos (job falhou, limite de email atingido, ticket ->
  -- gestor do contrato) não passam pelo motor de regras e criam sempre linha
  -- na fila. Nunca cancelar.
  if new.rule_run_id is null then
    return new;
  end if;

  -- Snapshot primeiro; regra viva só como recurso para runs pré-Fase 3.
  select coalesce(r.rule_snapshot->'regra'->>'acao_tipo', ar.acao_tipo),
         coalesce(r.rule_snapshot->'regra'->'acao_config', ar.acao_config)
    into v_tipo, v_config
  from public.automation_runs r
  left join public.automation_rules ar on ar.id = r.rule_id
  where r.id = new.rule_run_id;

  -- Run que já não existe, ou regra apagada sem definição congelada:
  -- preservar. Na dúvida, guardar — o custo de uma linha a mais é nulo ao pé
  -- do de perder o pai de um email.
  if v_tipo is null and v_config is null then
    return new;
  end if;

  -- A partir da divisão, o email tem tipo próprio e não precisa de flag. Este
  -- ramo entra antes do outro de propósito: uma regra `email` não tem
  -- `enviar_email`, e cair no coalesce abaixo cancelaria tudo.
  if v_tipo = 'email' then
    return new;
  end if;

  -- Regras de notificação anteriores à migração ainda trazem `enviar_email`.
  -- O ramo fica enquanto existir uma só que o tenha.
  if coalesce((v_config->>'enviar_email')::boolean, false) then
    return new;
  end if;

  return null;
end;
$function$;

revoke all on function public.fn_notifications_so_quando_ha_email() from public, anon, authenticated;
