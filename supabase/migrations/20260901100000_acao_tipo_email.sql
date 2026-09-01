-- ============================================================================
-- `acao_tipo = 'email'`: o correio passa a ser uma acção, não uma opção
-- ============================================================================
--
-- O executor já resolve os destinatários UMA vez e depois escreve nos dois
-- sítios — `notificacoes` (o que se vê na app) e `notifications` +
-- `notification_queue` (o pipeline de email) —, separados pela variável
-- `v_enviar_email`. A separação que queremos já existe em código; o que está
-- errado é quem decide.
--
-- Quatro substituições, não três: os dois inserts em `notificacoes` estão em
-- ramos com indentação diferente (o do motorista e o do laço geral) e não
-- podem partilhar âncora — o mesmo que já obrigou a Fase 2 a ter seis.
--
-- A resolução de destinatários não é tocada por nenhuma delas. É esse o teste
-- de que a separação está no sítio certo.
-- ============================================================================

-- ── 1. O CHECK aceita o tipo novo ───────────────────────────────────────────
alter table public.automation_rules drop constraint if exists automation_rules_acao_tipo_check;

alter table public.automation_rules
  add constraint automation_rules_acao_tipo_check
  check (acao_tipo = any (array['notificacao'::text, 'email'::text, 'webhook'::text, 'automacao_interna'::text]));

-- ── 2. As quatro cirurgias no executor ──────────────────────────────────────
do $$
declare
  v_src   text;
  v_novo  text;
  v_antes text;
  v_pares text[][] := array[
    -- (a) deixar passar o tipo novo
    array[
      E'      if v_rule.acao_tipo <> ''notificacao'' then\n        perform public.automation_runs_complete(v_run.id);\n        continue;\n      end if;',
      E'      if v_rule.acao_tipo not in (''notificacao'', ''email'') then\n        perform public.automation_runs_complete(v_run.id);\n        continue;\n      end if;'
    ],
    -- (b) o email vem do TIPO, não de um campo da config
    array[
      E'      v_enviar_email := coalesce((v_rule.acao_config->>''enviar_email'')::boolean, false);',
      E'      -- O email é uma acção própria desde 2026-09-01. Ler um campo da\n      -- config deixaria dois sítios a decidir a mesma coisa.\n      v_enviar_email := (v_rule.acao_tipo = ''email'');'
    ],
    -- (c) ramo do motorista: a linha in-app só para notificações
    array[
      E'          if v_tipo_legado is not null then\n            insert into public.notificacoes',
      E'          if v_rule.acao_tipo = ''notificacao'' and v_tipo_legado is not null then\n            insert into public.notificacoes'
    ],
    -- (d) laço geral: idem, e a indentação é o que os distingue
    array[
      E'        if v_tipo_legado is not null then\n          insert into public.notificacoes',
      E'        if v_rule.acao_tipo = ''notificacao'' and v_tipo_legado is not null then\n          insert into public.notificacoes'
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
      raise exception 'Cirurgia %/% no executor não casou.', i, array_length(v_pares, 1)
        using hint = 'Comparar com pg_get_functiondef. Nada foi alterado.';
    end if;
  end loop;

  -- Pós-condição: os dois inserts in-app ficaram ambos restritos.
  if (length(v_novo) - length(replace(v_novo, 'acao_tipo = ''notificacao'' and v_tipo_legado', '')))
     / length('acao_tipo = ''notificacao'' and v_tipo_legado') <> 2 then
    raise exception 'Esperava dois inserts de notificacoes restritos, encontrei outro número.';
  end if;

  -- Pós-condição: ninguém volta a ler enviar_email no executor.
  if v_novo like '%acao_config->>''enviar_email''%' then
    raise exception 'Sobrou uma leitura de enviar_email no executor.';
  end if;

  execute v_novo;
end $$;

revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;

-- ── 3. O validador aceita o tipo novo ───────────────────────────────────────
-- Ainda NÃO recusa `enviar_email` numa notificação: isso entra com a migração
-- das 66, na mesma transação, para não existir uma janela em que editar uma
-- regra antiga seja recusado por ter um campo que ainda não foi retirado.
--
-- O ramo do email exige o mesmo que o da notificação — template e título — e
-- valida os mesmos formatos de destinatário. É deliberadamente o mesmo corpo:
-- as duas acções escolhem pessoas da mesma maneira.
create or replace function public.fn_validar_acao_config()
returns trigger
language plpgsql
as $function$
declare
  v_estrategia text;
  v_modo text;
  v_accao text;
  v_def jsonb;
  v_campo text;
  v_evento_entidade text;
begin
  -- ── Automações internas (inalterado) ──────────────────────────────────
  if new.acao_tipo = 'automacao_interna' then
    if TG_OP = 'UPDATE' and new.acao_config is not distinct from old.acao_config then
      return new;
    end if;

    v_accao := new.acao_config->>'accao';
    v_def   := public.automation_catalogo() -> 'accoes' -> v_accao;
    v_evento_entidade := public.automation_catalogo() -> 'eventos' -> new.event_type ->> 'entidade';

    if v_def is null then
      raise exception 'acao_config inválido: acção interna "%" não existe no catálogo.', coalesce(v_accao, '(nula)')
        using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
    end if;

    if not (new.acao_config ? 'valor') then
      raise exception 'acao_config inválido: a acção "%" precisa de um valor.', v_accao
        using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
    end if;

    if v_def ? 'campos_permitidos' then
      v_campo := new.acao_config->>'campo';
      if v_campo is null or not (v_def->'campos_permitidos' @> to_jsonb(v_campo)) then
        raise exception 'acao_config inválido: campo "%" não é permitido em "%".', coalesce(v_campo, '(nulo)'), v_accao
          using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
      end if;
    end if;

    if v_def ? 'valores' and not (v_def->'valores' @> to_jsonb(new.acao_config->>'valor')) then
      raise exception 'acao_config inválido: valor "%" não é aceite por "%".', new.acao_config->>'valor', v_accao
        using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
    end if;

    if v_evento_entidade is not null
       and v_def->>'entidade' is distinct from v_evento_entidade then
      raise exception 'acao_config inválido: a acção "%" opera sobre %, mas o evento "%" é de %.',
        v_accao, v_def->>'entidade', new.event_type, v_evento_entidade
        using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
    end if;

    if auth.uid() is not null and not public.can_edit(auth.uid(), v_def->>'recurso') then
      raise exception 'sem permissão "%" para configurar a acção "%".', v_def->>'recurso', v_accao
        using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
    end if;

    return new;
  end if;

  -- ── Notificação e email partilham a validação de destinatários ────────
  if new.acao_tipo not in ('notificacao', 'email') then
    return new;
  end if;

  if TG_OP = 'UPDATE' and new.acao_config is not distinct from old.acao_config then
    return new;
  end if;

  if not (new.acao_config ? 'template_codigo') or btrim(coalesce(new.acao_config->>'template_codigo', '')) = '' then
    raise exception 'acao_config inválido: template_codigo é obrigatório.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if not (new.acao_config ? 'titulo') or btrim(coalesce(new.acao_config->>'titulo', '')) = '' then
    raise exception 'acao_config inválido: titulo é obrigatório.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  v_estrategia := new.acao_config->>'destinatarios_estrategia';
  if v_estrategia is not null and v_estrategia not in ('cargo', 'gestor_responsavel', 'motorista') then
    raise exception 'acao_config inválido: destinatarios_estrategia "%" desconhecido.', v_estrategia
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'destinatarios_cargo_ids' and jsonb_typeof(new.acao_config->'destinatarios_cargo_ids') <> 'array' then
    raise exception 'acao_config inválido: destinatarios_cargo_ids tem de ser um array.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'destinatarios_user_ids' and jsonb_typeof(new.acao_config->'destinatarios_user_ids') <> 'array' then
    raise exception 'acao_config inválido: destinatarios_user_ids tem de ser um array.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  v_modo := new.acao_config->>'destinatarios_modo';
  if v_modo is not null and v_modo not in ('grupo', 'individual') then
    raise exception 'acao_config inválido: destinatarios_modo "%" desconhecido.', v_modo
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'enviar_email' and jsonb_typeof(new.acao_config->'enviar_email') <> 'boolean' then
    raise exception 'acao_config inválido: enviar_email tem de ser boolean.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'enviar_email_digest' and jsonb_typeof(new.acao_config->'enviar_email_digest') <> 'boolean' then
    raise exception 'acao_config inválido: enviar_email_digest tem de ser boolean.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  return new;
end;
$function$;
