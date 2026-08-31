-- ============================================================================
-- O validador ganha destinatarios_emails_livres
-- ============================================================================
--
-- Só faz sentido numa acção de email — uma notificação in-app não tem para
-- onde mandar um endereço fora da WeGest. E cada endereço tem de parecer um
-- email: sanidade de formato, não RFC5322 completo.
-- ============================================================================

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

  if new.acao_tipo not in ('notificacao', 'email') then
    return new;
  end if;

  if TG_OP = 'UPDATE' and new.acao_config is not distinct from old.acao_config then
    return new;
  end if;

  if auth.uid() is not null
     and new.acao_tipo = 'notificacao'
     and (new.acao_config ? 'enviar_email' or new.acao_config ? 'enviar_email_digest') then
    raise exception 'acao_config inválido: o email tem acção própria — cria uma regra com acao_tipo = ''email''.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  -- Fase 2: emails avulsos não têm para onde ir numa notificação in-app.
  if new.acao_tipo = 'notificacao' and new.acao_config ? 'destinatarios_emails_livres' then
    raise exception 'acao_config inválido: destinatarios_emails_livres só é aceite numa acção de email.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'destinatarios_emails_livres' then
    if jsonb_typeof(new.acao_config->'destinatarios_emails_livres') <> 'array' then
      raise exception 'acao_config inválido: destinatarios_emails_livres tem de ser um array.'
        using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(new.acao_config->'destinatarios_emails_livres') e
      where e !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ) then
      raise exception 'acao_config inválido: destinatarios_emails_livres tem um endereço mal formado.'
        using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
    end if;
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
