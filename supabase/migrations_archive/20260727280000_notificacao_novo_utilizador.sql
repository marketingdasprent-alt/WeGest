-- Motor de Automação — L2 da auditoria: aviso de criação de novo
-- utilizador. create-user (e o signup normal) criam um utilizador sem
-- avisar mais ninguém na organização além de quem executou a ação — dá-se
-- aqui um segundo par de olhos automático sobre esta operação sensível.
-- Só para STAFF ('colaborador'): o self-signup de motoristas é rotina, não
-- uma operação de gestão de acessos, e notificar cada motorista novo
-- inundaria os admins sem valor equivalente.

-- 1. handle_new_user_org(): emitir o evento no fim, sem alterar nada do
--    comportamento existente de ligação de perfil/org.
create or replace function public.handle_new_user_org()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  _org_id uuid;
  _cargo_id uuid;
  _cargo_nome text;
  _is_first_user boolean;
  _user_nome text;
  _user_phone text;
  _normalized_phone text;
  _motorista_id uuid;
  _is_motorista_signup boolean;
  _tipo_utilizador text;
  _skip_org_assign boolean;
begin
  _is_first_user := (select count(*) = 0 from public.profiles);
  _user_nome := coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1));
  _user_phone := new.raw_user_meta_data->>'telefone';
  _normalized_phone := public.normalize_phone(_user_phone);
  _is_motorista_signup := coalesce(new.raw_user_meta_data->>'cargo_nome', '') = 'Motorista';
  _tipo_utilizador := coalesce(new.raw_user_meta_data->>'tipo_utilizador',
                       case when _is_motorista_signup then 'motorista' else 'colaborador' end);

  _skip_org_assign := (_tipo_utilizador = 'colaborador'
                       and new.raw_user_meta_data->>'cargo_nome' is null
                       and new.raw_user_meta_data->>'cargo_id' is null);

  select c.org_id, c.cargo_id, cg.nome
  into _org_id, _cargo_id, _cargo_nome
  from public.convites c
  left join public.cargos cg on cg.id = c.cargo_id
  where c.email = new.email
    and c.usado = false
  order by c.created_at desc
  limit 1;

  if _cargo_id is null and new.raw_user_meta_data->>'cargo_id' is not null then
    _cargo_id := (new.raw_user_meta_data->>'cargo_id')::uuid;
    select nome into _cargo_nome from public.cargos where id = _cargo_id;
  end if;

  if _org_id is null and new.raw_user_meta_data->>'org_id' is not null then
    _org_id := (new.raw_user_meta_data->>'org_id')::uuid;
  end if;

  if _org_id is null and not _skip_org_assign then
    select id into _org_id from public.organizacoes where ativa = true order by created_at asc limit 1;
  end if;

  if _org_id is null then
    select id into _org_id from public.organizacoes
    where ativa = true order by created_at desc limit 1;
  end if;

  insert into public.profiles (id, email, nome, org_id, cargo_id, cargo, is_admin, tipo_utilizador)
  values (
    new.id, new.email, _user_nome, _org_id, _cargo_id, _cargo_nome,
    coalesce(_is_first_user, false), _tipo_utilizador
  )
  on conflict (id) do update set
    org_id = coalesce(excluded.org_id, profiles.org_id),
    cargo_id = coalesce(excluded.cargo_id, profiles.cargo_id),
    cargo = coalesce(excluded.cargo, profiles.cargo),
    tipo_utilizador = coalesce(excluded.tipo_utilizador, profiles.tipo_utilizador);

  if _org_id is not null then
    insert into public.user_organizacoes (user_id, org_id, role, cargo_id, is_admin)
    values (new.id, _org_id, 'member', _cargo_id, coalesce(_is_first_user, false))
    on conflict (user_id, org_id) do nothing;

    insert into public.user_org_ativa (user_id, org_id)
    values (new.id, _org_id)
    on conflict (user_id) do nothing;
  end if;

  if _is_motorista_signup
     and new.email is not null
     and _org_id is not null then
    select ma.id into _motorista_id
    from public.motoristas_ativos ma
    where ma.user_id is null
      and ma.org_id = _org_id
      and ma.email is not null
      and lower(ma.email) = lower(new.email)
    order by ma.created_at asc nulls last, ma.id asc
    limit 1;

    if _motorista_id is not null then
      update public.motoristas_ativos
      set user_id = new.id, updated_at = now()
      where id = _motorista_id and user_id is null;
    end if;
  end if;

  if _is_motorista_signup
     and _motorista_id is null
     and _normalized_phone is not null
     and _org_id is not null then
    select ma.id into _motorista_id
    from public.motoristas_ativos ma
    where ma.user_id is null
      and ma.org_id = _org_id
      and ma.email is null
      and ma.telefone is not null
      and public.normalize_phone(ma.telefone) = _normalized_phone
    order by ma.created_at asc nulls last, ma.id asc
    limit 1;

    if _motorista_id is not null then
      update public.motoristas_ativos
      set user_id = new.id, updated_at = now()
      where id = _motorista_id and user_id is null;
    end if;
  end if;

  -- Novo: segundo par de olhos automático sobre a criação de STAFF.
  -- Motoristas ficam de fora deliberadamente (self-signup é rotina).
  if _tipo_utilizador = 'colaborador' and _org_id is not null then
    insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
    values (
      _org_id, 'utilizador.criado', 'profiles', new.id,
      jsonb_build_object('nome', _user_nome, 'email', new.email),
      'trigger'
    );
  end if;

  return new;
end;
$$;

-- 2. seed_automacao_defaults(): nova regra utilizador.criado (só
--    notificação interna, dirigida a quem gere utilizadores/admins).
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
      jsonb_build_object('template_codigo', 'viatura.seguro_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Seguro de viatura a expirar'),
      1440
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'Inspeção periódica (IPO) a expirar', 'viatura.inspecao_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.inspecao_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Inspeção periódica (IPO) a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'Carta de condução do motorista a expirar', 'motorista.carta_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.carta_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Carta de condução do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'Licença TVDE do motorista a expirar', 'motorista.licenca_tvde_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.licenca_tvde_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Licença TVDE do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'cobranca.gerada', 'Nova cobrança gerada — pronta a emitir', 'cobranca.gerada', 'notificacao',
      jsonb_build_object('template_codigo', 'cobranca.gerada', 'destinatarios_recurso', 'renting_contratos', 'enviar_email', false, 'titulo', 'Nova cobrança gerada'),
      0
    ),
    (
      p_org_id, 'utilizador.criado', 'Novo utilizador criado', 'utilizador.criado', 'notificacao',
      jsonb_build_object('template_codigo', 'utilizador.criado', 'destinatarios_recurso', 'admin_utilizadores', 'enviar_email', false, 'titulo', 'Novo utilizador criado'),
      0
    )
  on conflict (codigo, org_id) do nothing;

  insert into public.notification_templates (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, variaveis_esperadas)
  values
    (
      p_org_id, 'viatura.seguro_expirando', 'email', 'pt-PT',
      'Seguro da viatura {{matricula}} a expirar',
      'O seguro da viatura {{matricula}} expira em {{seguro_validade}}. Confirma se a renovação já está tratada.',
      'text', array['matricula', 'seguro_validade']
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'email', 'pt-PT',
      'Inspeção periódica (IPO) da viatura {{matricula}} a expirar',
      'A inspeção periódica (IPO) da viatura {{matricula}} expira em {{inspecao_validade}}. Agenda a inspeção antes da data.',
      'text', array['matricula', 'inspecao_validade']
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'email', 'pt-PT',
      'Carta de condução de {{nome}} a expirar',
      'A carta de condução de {{nome}} expira em {{carta_validade}}. Confirma que a renovação está a ser tratada antes de atribuir novos contratos.',
      'text', array['nome', 'carta_validade']
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'email', 'pt-PT',
      'Licença TVDE de {{nome}} a expirar',
      'A licença TVDE de {{nome}} expira em {{licenca_tvde_validade}}. Confirma que a renovação está a ser tratada antes de atribuir novos contratos.',
      'text', array['nome', 'licenca_tvde_validade']
    )
  on conflict (codigo, canal, idioma, versao, org_id) do nothing;
end;
$$;

-- 3. Backfill: toda organização existente ganha a regra nova.
do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizacoes loop
    perform public.seed_automacao_defaults(v_org.id);
  end loop;
end;
$$;
