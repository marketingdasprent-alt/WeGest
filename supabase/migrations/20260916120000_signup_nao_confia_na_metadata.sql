-- Auditoria 2026-09-16 (CRITICAL): org/cargo do registo vinham de
-- raw_user_meta_data, controlado pelo cliente — dava para escolher a org e um
-- cargo privilegiado ao criar conta. Agora só de: app_metadata (servidor),
-- convite válido, ou (motoristas) org escolhida + cargo Motorista fixo.

create or replace function public.handle_new_user_org() returns trigger
    language plpgsql security definer
    set search_path to 'public'
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
  _app_org_id uuid;
  _app_cargo_id uuid;
  _meta_org_id uuid;
  _cargo_motorista_id constant uuid := 'a0000000-0000-0000-0000-000000000001';
begin
  _is_first_user := (select count(*) = 0 from public.profiles);
  _user_nome := coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1));
  _user_phone := new.raw_user_meta_data->>'telefone';
  _normalized_phone := public.normalize_phone(_user_phone);

  -- Só decide "é motorista?"; nunca escolhe um cargo.
  _is_motorista_signup :=
       coalesce(new.raw_user_meta_data->>'cargo_nome', '') = 'Motorista'
    or coalesce(new.raw_user_meta_data->>'tipo_utilizador', '') = 'motorista';

  -- UUID pode ser lixo vindo do cliente; não rebentar o insert.
  begin
    _meta_org_id := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  exception when others then
    _meta_org_id := null;
  end;

  begin
    _app_org_id := nullif(new.raw_app_meta_data->>'org_id', '')::uuid;
    _app_cargo_id := nullif(new.raw_app_meta_data->>'cargo_id', '')::uuid;
  exception when others then
    _app_org_id := null;
    _app_cargo_id := null;
  end;

  -- 1. Servidor (app_metadata).
  if _app_org_id is not null then
    _org_id := _app_org_id;
    if _app_cargo_id is not null then
      select c.id, c.nome into _cargo_id, _cargo_nome
      from public.cargos c
      where c.id = _app_cargo_id
        and (c.org_id = _org_id or c.id = _cargo_motorista_id);
    end if;
    if coalesce(new.raw_app_meta_data->>'tipo_utilizador', '') in ('motorista', 'colaborador') then
      _tipo_utilizador := new.raw_app_meta_data->>'tipo_utilizador';
    end if;
  end if;

  -- 2. Convite válido para este email.
  if _org_id is null then
    select c.org_id, c.cargo_id, cg.nome
    into _org_id, _cargo_id, _cargo_nome
    from public.convites c
    left join public.cargos cg on cg.id = c.cargo_id
    where lower(c.email) = lower(new.email)
      and c.usado = false
      and (c.expires_at is null or c.expires_at > now())
    order by c.created_at desc
    limit 1;
  end if;

  -- 3. Auto-registo de motorista: org escolhida pelo candidato, cargo fixo.
  if _org_id is null and _is_motorista_signup and _meta_org_id is not null then
    select o.id into _org_id
    from public.organizacoes o
    where o.id = _meta_org_id and o.ativa = true;

    if _org_id is not null then
      select c.id, c.nome into _cargo_id, _cargo_nome
      from public.cargos c
      where c.id = _cargo_motorista_id;
    end if;
  end if;

  -- 4. Arranque da instalação.
  if _org_id is null and _is_first_user then
    select id into _org_id from public.organizacoes
    where ativa = true order by created_at asc limit 1;
  end if;

  if _tipo_utilizador is null then
    _tipo_utilizador := case
      when _is_motorista_signup or _cargo_id = _cargo_motorista_id then 'motorista'
      else 'colaborador'
    end;
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

  if _tipo_utilizador = 'motorista'
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

  if _tipo_utilizador = 'motorista'
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

comment on function public.handle_new_user_org() is
  'Cria profile/membership ao nascer um auth.user. Organização e cargo vêm de raw_app_meta_data (servidor), de um convite válido, ou — só para motoristas — da org escolhida no registo com o cargo Motorista fixo. Nunca de raw_user_meta_data (auditoria 2026-09-16).';
