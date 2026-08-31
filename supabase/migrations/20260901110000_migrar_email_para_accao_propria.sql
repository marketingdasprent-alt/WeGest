-- ============================================================================
-- As regras que enviavam email ganham uma gémea de tipo `email`
-- ============================================================================
--
-- Em produção a 2026-08-31: 95 regras, todas `notificacao`; 66 com
-- `enviar_email = true` (ganham gémea), 29 com `enviar_email = false` (só
-- perdem a chave — nunca enviaram nada), 33 das 66 também com digest.
--
-- As gémeas nascem ACTIVAS e a copiar tudo — destinatários, condições,
-- cooldown, prioridade. O comportamento não pode mudar por causa de uma
-- refactorização, e neste sistema a falha perigosa é o silêncio: ninguém
-- repara que o aviso não chegou.
--
-- A divisão vive numa FUNÇÃO e não solta na migração porque tem dois
-- chamadores: esta migração, para as organizações que já existem, e o trigger
-- de seed, para as que nascerem a seguir. Duas implementações divergiriam.
--
-- ── `CODIGO` NÃO É SEQUENCIAL ────────────────────────────────────────────────
--
-- É `text`, `NOT NULL`, com `UNIQUE(codigo, org_id)` — e em produção é
-- literalmente o `event_type` em todas as linhas. Os dois seeds usam
-- `on conflict (codigo, org_id) do nothing` precisamente para isso: `codigo` é
-- a chave natural «uma regra por evento por organização», não um número. Não
-- há CHECK a impor a igualdade com `event_type` — é convenção dos seeds — por
-- isso a gémea pode ter um código diferente. Escolhido: `codigo || '.email'`.
-- ============================================================================

create or replace function public.fn_dividir_email_das_regras(p_org_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regra   public.automation_rules;
  v_criadas int := 0;
begin
  -- 1) Uma gémea por regra que REALMENTE enviava email. `on conflict do
  -- nothing` é o que torna isto seguro a repetir — o seed pode chamar isto em
  -- toda organização nova sem duplicar nada se algum dia for corrido a mais.
  for v_regra in
    select * from public.automation_rules
    where org_id = p_org_id
      and acao_tipo = 'notificacao'
      and coalesce((acao_config->>'enviar_email')::boolean, false)
    order by codigo
  loop
    insert into public.automation_rules (
      org_id, codigo, nome, descricao, event_type, condicoes,
      acao_tipo, acao_config, prioridade, cooldown_minutos, ativo, criado_por
    )
    values (
      p_org_id,
      v_regra.codigo || '.email',
      left(v_regra.nome || ' (email)', 200),
      'Nasceu da divisão entre notificação e email. Envia por correio o que a regra '
        || v_regra.codigo || ' enviava.',
      v_regra.event_type,
      v_regra.condicoes,
      'email',
      v_regra.acao_config - 'enviar_email',
      v_regra.prioridade,
      v_regra.cooldown_minutos,
      v_regra.ativo,
      null
    )
    on conflict (codigo, org_id) do nothing;

    if found then
      v_criadas := v_criadas + 1;
    end if;
  end loop;

  -- 2) A chave sai de TODAS as regras de notificação que a tenham — com
  -- `true` ou com `false`. Uma regra com `enviar_email = false` nunca entra no
  -- laço acima (nada a separar), mas ficaria com a chave por limpar, e o
  -- validador a seguir passa a recusar qualquer presença dela numa
  -- notificação. Medido a 2026-08-31: 29 regras nesta situação.
  update public.automation_rules
     set acao_config = acao_config - 'enviar_email' - 'enviar_email_digest'
   where org_id = p_org_id
     and acao_tipo = 'notificacao'
     and (acao_config ? 'enviar_email' or acao_config ? 'enviar_email_digest');

  return v_criadas;
end;
$$;

revoke all on function public.fn_dividir_email_das_regras(uuid) from public, anon, authenticated;
grant execute on function public.fn_dividir_email_das_regras(uuid) to service_role;

-- ── O seed passa a dividir logo a seguir a semear ───────────────────────────
-- Sem isto, uma organização nova nasceria com 5 regras a notificar e nenhuma a
-- enviar email — e ninguém repararia até alguém perguntar porque não recebeu
-- o aviso do seguro.
create or replace function public.trg_organizacoes_seed_automacao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.ensure_base_cargos(new.id);
  perform public.seed_automacao_defaults(new.id);
  perform public.seed_automacao_danos_assistencia(new.id);
  -- Os seeds declaram `enviar_email` como sempre declararam; a divisão
  -- acontece aqui, no mesmo INSERT da organização.
  perform public.fn_dividir_email_das_regras(new.id);
  return new;
end;
$function$;

-- ── As organizações que já existem ──────────────────────────────────────────
do $$
declare
  v_org record;
  v_criadas int := 0;
  v_esperadas int;
begin
  select count(*) into v_esperadas
  from public.automation_rules
  where acao_tipo = 'notificacao'
    and coalesce((acao_config->>'enviar_email')::boolean, false);

  for v_org in select distinct org_id from public.automation_rules loop
    v_criadas := v_criadas + public.fn_dividir_email_das_regras(v_org.org_id);
  end loop;

  -- ── Pós-condições, dentro da mesma transação ──────────────────────────
  if v_criadas <> v_esperadas then
    raise exception 'Esperava criar % gémeas, criei %.', v_esperadas, v_criadas;
  end if;

  if exists (select 1 from public.automation_rules
              where acao_tipo = 'notificacao'
                and (acao_config ? 'enviar_email' or acao_config ? 'enviar_email_digest')) then
    raise exception 'Sobrou uma regra de notificação com configuração de email.';
  end if;

  raise notice 'Divisão concluída: % gémeas de email criadas.', v_criadas;
end $$;

-- ── O validador passa a recusar, agora que já não há nada a recusar ─────────
-- Na MESMA migração, de propósito: entre o deploy do validador e o da divisão
-- existiria uma janela em que editar uma das 66 seria recusado por ter um
-- campo que ainda não tinha sido retirado.
--
-- `auth.uid()` nulo é contexto de sistema — seed, migração, service_role — e
-- não é bloqueado, pelo mesmo princípio que a permissão das acções internas já
-- usa. É isso que deixa `seed_automacao_defaults` continuar a declarar
-- `enviar_email` nas suas 26 ocorrências sem partir a criação de
-- organizações: o seed declara, o trigger divide logo a seguir.
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

  -- A partir de agora, o email é um TIPO de acção. Uma notificação com
  -- `enviar_email` é configuração de duas coisas ao mesmo tempo, que é
  -- exactamente o que esta divisão veio acabar. Isento quando não há
  -- identidade (contexto de sistema): é o que deixa o seed continuar a
  -- declarar o campo sem que o trigger de divisão, que corre a seguir,
  -- rebente.
  if auth.uid() is not null
     and new.acao_tipo = 'notificacao'
     and (new.acao_config ? 'enviar_email' or new.acao_config ? 'enviar_email_digest') then
    raise exception 'acao_config inválido: o email tem acção própria — cria uma regra com acao_tipo = ''email''.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
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
