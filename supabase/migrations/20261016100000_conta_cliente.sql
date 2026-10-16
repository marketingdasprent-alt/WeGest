-- ============================================================
-- Conta de cliente rent-a-car (site da Década)
-- ============================================================
-- O site cria contas no Supabase Auth do WeGest com tipo_utilizador =
-- 'cliente': sem organização, sem cargo, sem acesso a nada interno. Ao
-- confirmar o email, a conta liga-se à ficha de cliente (clientes.user_id)
-- da org escolhida no registo, se essa org tiver uma chave activa com
-- conta:read: a ficha da equipa mais antiga com o mesmo email, ou uma nova.
-- Sem ficha nessa altura, liga-se no primeiro pedido à API com a chave de
-- uma org (ligação preguiçosa). A API (edge api-rent-a-car, service_role)
-- mostra-lhe as suas reservas e as faturas emitidas em seu nome e deixa
-- cancelar uma reserva pendente.
-- ============================================================

-- ── 1. Tipo de utilizador 'cliente' ─────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_tipo_utilizador_check;
alter table public.profiles add constraint profiles_tipo_utilizador_check
  check (tipo_utilizador in ('motorista', 'colaborador', 'cliente'));

-- ── 2. Ficha ligada à conta ─────────────────────────────────────────────────
alter table public.clientes
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Marca as fichas criadas por cliente_ligar_conta a partir do registo (dados não
-- verificados). created_by não serve: fica null se o colaborador for apagado.
alter table public.clientes
  add column if not exists criada_no_registo boolean not null default false;

create unique index if not exists clientes_user_id_por_org
  on public.clientes (org_id, user_id)
  where user_id is not null and deleted_at is null;

comment on column public.clientes.user_id is
  'Conta de cliente do site (profiles.tipo_utilizador = cliente) dona desta ficha. Ligada só por cliente_ligar_conta() depois de o email ser confirmado; uma ficha activa por conta e organização. Pedidos directos da REST (authenticated/anon) não a mudam: trigger clientes_user_id_so_pelo_servidor.';
comment on column public.clientes.criada_no_registo is
  'Ficha criada por cliente_ligar_conta ao confirmar o email de uma conta do site (dados do formulário, não verificados). Não é candidata a ligação, nem serve para faturas sem cobrança nem para reservas anónimas. Só o servidor a escreve: trigger clientes_user_id_so_pelo_servidor.';

-- A equipa edita as fichas pela REST (policy clientes_update): mudar user_id
-- dava a ficha (reservas, faturas) a outra conta. Só as funções SECURITY
-- DEFINER (current_user = dono) a mexem, e criada_no_registo também. INVOKER
-- de propósito.
create or replace function public.clientes_user_id_so_pelo_servidor()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.user_id := null;
      new.criada_no_registo := false;
    else
      if new.user_id is distinct from old.user_id then
        new.user_id := old.user_id;
      end if;
      if new.criada_no_registo is distinct from old.criada_no_registo then
        new.criada_no_registo := old.criada_no_registo;
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists clientes_user_id_so_pelo_servidor on public.clientes;
create trigger clientes_user_id_so_pelo_servidor
  before insert or update of user_id, criada_no_registo on public.clientes
  for each row execute function public.clientes_user_id_so_pelo_servidor();

-- Um admin muda tipo_utilizador pela REST (policy mt_profiles_update) e
-- profiles_bloqueia_auto_escalada só trava o próprio. Sem isto, uma conta de
-- colaborador criada por um admin passava a 'cliente' e ligava-se à ficha de
-- outra pessoa. A passagem de ou para 'cliente' é só do servidor; motorista e
-- colaborador continuam a mudar como antes. INVOKER de propósito.
create or replace function public.profiles_tipo_cliente_so_pelo_servidor()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.tipo_utilizador is distinct from old.tipo_utilizador
     and 'cliente' in (old.tipo_utilizador, new.tipo_utilizador) then
    new.tipo_utilizador := old.tipo_utilizador;
  end if;
  return new;
end $$;

drop trigger if exists profiles_tipo_cliente_so_pelo_servidor on public.profiles;
create trigger profiles_tipo_cliente_so_pelo_servidor
  before update of tipo_utilizador on public.profiles
  for each row execute function public.profiles_tipo_cliente_so_pelo_servidor();

-- ── 3. Ligação conta → ficha ────────────────────────────────────────────────
-- Só corre depois de o email estar confirmado: é isso que prova que a ficha
-- com o mesmo email é de quem se registou. Só fichas criadas pela equipa
-- (not criada_no_registo): a ficha que esta função cria a partir do formulário
-- não pode ser herdada por outra conta se a primeira for apagada. Só contas de
-- cliente sem organização nem membership: um admin consegue pôr tipo 'cliente'
-- numa conta de equipa por SQL, não pela REST (trigger dos profiles).
-- Só em orgs com site de conta (chave activa com conta:read): a org da
-- metadata é escolhida por quem se regista. p_org_id vem da chave da API.
-- Duas ou mais fichas candidatas (email partilhado ou genérico): não liga nem
-- cria; a equipa resolve. A ficha criada aqui não leva o NIF do formulário
-- (ninguém o verificou): fica nas observações até a equipa o confirmar.
-- Nunca altera uma ficha existente além de user_id. Um erro aqui não pode
-- impedir o registo nem a confirmação do email: fica no log como WARNING.
create or replace function public.cliente_ligar_conta(p_user_id uuid, p_org_id uuid default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text;
  v_confirmado timestamptz;
  v_meta jsonb;
  v_org uuid;
  v_cliente uuid;
  v_candidatas uuid[];
  v_nif text;
  v_txt text;
  v_nascimento date;
begin
  select u.email, u.email_confirmed_at, coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_email, v_confirmado, v_meta
    from auth.users u
   where u.id = p_user_id;
  if v_confirmado is null or nullif(btrim(v_email), '') is null then
    return null;
  end if;
  if not exists (select 1 from public.profiles p
                  where p.id = p_user_id and p.tipo_utilizador = 'cliente' and p.org_id is null)
     or exists (select 1 from public.user_organizacoes uo where uo.user_id = p_user_id) then
    return null;
  end if;

  -- org_id da metadata vem do cliente: lixo não rebenta; inexistente, inactiva
  -- ou sem chave de conta não liga.
  v_org := p_org_id;
  if v_org is null then
    begin
      v_org := nullif(v_meta->>'org_id', '')::uuid;
    exception when others then
      v_org := null;
    end;
  end if;
  select o.id into v_org from public.organizacoes o where o.id = v_org and o.ativa;
  if v_org is null or not exists (
       select 1 from public.api_chaves k
        where k.org_id = v_org
          and k.ativo
          and (k.expires_at is null or k.expires_at > now())
          and k.escopo = 'rent_a_car'
          and 'conta:read' = any (k.permissoes)) then
    return null;
  end if;

  -- Duas confirmações em paralelo não criam duas fichas.
  perform pg_advisory_xact_lock(hashtext('cliente_ligar_conta:' || p_user_id::text));

  select c.id into v_cliente from public.clientes c
   where c.org_id = v_org and c.user_id = p_user_id and c.deleted_at is null;
  if v_cliente is not null then
    return v_cliente;
  end if;

  begin
    select array_agg(x.id) into v_candidatas
      from (select c.id from public.clientes c
             where c.org_id = v_org
               and c.deleted_at is null
               and not c.is_emissora
               and c.user_id is null
               and not c.criada_no_registo
               and c.tipo_cliente = 'particular'
               and lower(btrim(c.email)) = lower(btrim(v_email))
             limit 2
             for update) x;

    if cardinality(v_candidatas) > 1 then
      return null;
    end if;
    if cardinality(v_candidatas) = 1 then
      update public.clientes set user_id = p_user_id
       where id = v_candidatas[1] and user_id is null
      returning id into v_cliente;
      return v_cliente;
    end if;

    -- nif_pt_valido é STRICT: só se chama com texto.
    v_nif := regexp_replace(coalesce(v_meta->>'nif', ''), '\s', '', 'g');
    if v_nif = '' or not public.nif_pt_valido(v_nif) then
      v_nif := null;
    end if;

    v_txt := btrim(coalesce(v_meta->>'data_nascimento', ''));
    if v_txt ~ '^\d{4}-\d{2}-\d{2}$' then
      begin
        v_nascimento := v_txt::date;
      exception when others then
        v_nascimento := null;
      end;
      if v_nascimento > current_date or v_nascimento < date '1900-01-01' then
        v_nascimento := null;
      end if;
    end if;

    -- Os textos vêm do formulário: cortados ao tamanho das colunas.
    insert into public.clientes (
      org_id, nome, email, telefone, nif, observacoes, data_nascimento, morada,
      codigo_postal, localidade, pais, tipo_cliente, created_by, user_id, criada_no_registo)
    values (
      v_org,
      left(coalesce(nullif(btrim(v_meta->>'nome'), ''), split_part(btrim(v_email), '@', 1)), 255),
      left(lower(btrim(v_email)), 255),
      left(nullif(btrim(v_meta->>'telefone'), ''), 50),
      null,
      'NIF indicado no registo (por confirmar): ' || v_nif,
      v_nascimento,
      left(nullif(btrim(v_meta->>'morada'), ''), 255),
      left(nullif(btrim(v_meta->>'codigo_postal'), ''), 20),
      left(nullif(btrim(v_meta->>'localidade'), ''), 150),
      left(coalesce(nullif(btrim(v_meta->>'pais'), ''), 'Portugal'), 100),
      'particular', null, p_user_id, true)
    returning id into v_cliente;
    return v_cliente;
  exception when others then
    raise warning 'cliente_ligar_conta(%): % [%]', p_user_id, sqlerrm, sqlstate;
    return null;
  end;
end $$;

comment on function public.cliente_ligar_conta(uuid, uuid) is
  'Liga uma conta de cliente com email confirmado a uma ficha da org p_org_id (da chave da API) ou, sem ela, da org do registo (raw_user_meta_data.org_id). A org tem de estar activa e ter uma chave rent_a_car activa com conta:read. Só para contas de cliente sem organização nem membership. Liga a única particular com o mesmo email que não nasceu do registo (criada_no_registo), sem conta, não emissora; com duas ou mais não liga nem cria; sem nenhuma cria uma com os dados do registo, sem NIF (o indicado fica nas observações, por confirmar). Chamada pelos triggers de auth.users e por api_conta_cliente_id.';

-- ── 4. Trigger de confirmação do email ──────────────────────────────────────
create or replace function public.cliente_conta_confirmada()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.cliente_ligar_conta(new.id);
  return new;
end $$;

-- ── 5. handle_new_user_org com o ramo do cliente ────────────────────────────
-- Igual a 20261014150000 com um ramo novo no início: conta de cliente do site
-- (metadata 'cliente', sem app_metadata.org_id, sem convite) fica só com o
-- profile; liga já à ficha se o email vier confirmado (criada por admin).
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

  -- 0. Conta de cliente do site: sem org, sem cargo, sem membership, sem evento.
  -- A ficha liga-se em cliente_ligar_conta, só com o email confirmado. O arranque
  -- da instalação (primeiro utilizador) continua a ganhar.
  if coalesce(new.raw_user_meta_data->>'tipo_utilizador', '') = 'cliente'
     and _app_org_id is null
     and not _is_first_user
     and not exists (
       select 1 from public.convites c
        where lower(c.email) = lower(new.email)
          and c.usado = false
          and (c.expires_at is null or c.expires_at > now())) then
    insert into public.profiles (id, email, nome, org_id, cargo_id, cargo, is_admin, tipo_utilizador)
    values (new.id, new.email, _user_nome, null, null, null, false, 'cliente')
    on conflict (id) do nothing;

    if new.email_confirmed_at is not null then
      perform public.cliente_ligar_conta(new.id);
    end if;
    return new;
  end if;

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

  -- Sem ligação pelo telefone: vem da metadata do cliente e nunca é verificado,
  -- e dava a ficha (IBAN, conta-corrente) a quem escrevesse o número de outro.
  -- Fichas sem email ligam-se pela equipa (pôr o email na ficha) ou pelo onboarding.

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

-- ── 6. Comentário e triggers de auth.users ──────────────────────────────────
comment on function public.handle_new_user_org() is
  'Cria profile/membership ao nascer um auth.user. Organização e cargo vêm de raw_app_meta_data (servidor), de um convite válido, ou (só motoristas) da org escolhida no registo com o cargo Motorista fixo. Nunca de raw_user_meta_data (auditoria 2026-09-16). Liga a conta a uma ficha de motorista só pelo email (confirmado), nunca pelo telefone (2026-10-14). Conta de cliente do site: só o profile, sem org nem cargo; a ficha liga-se com o email confirmado (2026-10-16).';

drop trigger if exists on_auth_user_confirmed_cliente on auth.users;
create trigger on_auth_user_confirmed_cliente
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.cliente_conta_confirmada();

-- ── 7. Funções da API da conta ──────────────────────────────────────────────
-- Chamadas pela edge api-rent-a-car (service_role) com o org_id da chave e o
-- user_id do token já validado. Só vêem a ficha ligada nessa org. São VOLATILE
-- porque a primeira chamada pode ligar ou criar a ficha.

-- Sem ficha ligada nesta org, liga agora (conta de cliente confirmada): cobre
-- quem se registou noutra org ou antes de a org ter chave de conta.
create or replace function public.api_conta_cliente_id(p_org_id uuid, p_user_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cliente uuid;
begin
  select c.id into v_cliente from public.clientes c
   where c.org_id = p_org_id and c.user_id = p_user_id and c.deleted_at is null
   order by c.created_at, c.id
   limit 1;
  if v_cliente is null and p_org_id is not null and p_user_id is not null then
    v_cliente := public.cliente_ligar_conta(p_user_id, p_org_id);
  end if;
  return v_cliente;
end $$;

create or replace function public.api_conta(p_org_id uuid, p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text;
  v_confirmado timestamptz;
  v_tipo text;
  v_cliente uuid;
  v_motorista jsonb;
begin
  select u.email, u.email_confirmed_at, p.tipo_utilizador
    into v_email, v_confirmado, v_tipo
    from auth.users u
    join public.profiles p on p.id = u.id
   where u.id = p_user_id;
  if not found then
    return public.api_erro('CONTA_INVALIDA', 'Conta não encontrada.');
  end if;

  v_cliente := public.api_conta_cliente_id(p_org_id, p_user_id);

  if v_tipo = 'motorista' then
    v_motorista := jsonb_build_object(
      'candidatura', (select jsonb_build_object('id', c.id, 'estado', c.status)
                        from public.motorista_candidaturas c
                       where c.org_id = p_org_id and c.user_id = p_user_id
                       order by c.created_at desc
                       limit 1),
      'ficha', exists (select 1 from public.motoristas_ativos m
                        where m.org_id = p_org_id and m.user_id = p_user_id));
  end if;

  return jsonb_build_object(
    'email', v_email,
    'email_confirmado', v_confirmado is not null,
    'tipo', v_tipo,
    'cliente', (select jsonb_build_object('id', c.id, 'nome', c.nome, 'nif', c.nif, 'telefone', c.telefone)
                  from public.clientes c where c.id = v_cliente),
    'motorista', v_motorista);
end $$;

-- Uma reserva como a conta a vê.
create or replace function public.api_conta_reserva_resumo(p_org_id uuid, p_reserva_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return (
    select jsonb_build_object(
      'codigo', r.codigo,
      'estado', r.estado,
      'origem', r.origem,
      'inicio', r.data_inicio,
      'fim', r.data_fim,
      -- api_dias(x, null) dava 1.
      'dias', case when r.data_fim is not null then public.api_dias(r.data_inicio, r.data_fim) end,
      'modelo', case when mo.id is not null
                     then jsonb_build_object('marca', ma.nome, 'modelo', mo.nome) end,
      -- Pendente ainda não tem carro garantido: a matrícula só sai depois de a equipa confirmar.
      'matricula', case when r.estado::text in ('confirmada', 'em_curso', 'concluida')
                        then coalesce(r.matricula::text, v.matricula::text) end,
      'estacoes', jsonb_build_object('entrega', ee.nome, 'recolha', er.nome),
      'total', coalesce(
        nullif(r.dados_site->'cotacao'->'subtotal', 'null'::jsonb),
        public.api_preco_json_iva_incluido(coalesce(r.valor_total_manual, r.valor_total),
                                           public.api_iva_rent_a_car(p_org_id))),
      'pode_cancelar', r.estado::text = 'pendente' and r.data_inicio > now())
      from public.reservas r
      left join public.viaturas v on v.id = r.viatura_id and v.org_id = p_org_id
      left join public.viatura_modelos mo on mo.id = coalesce(r.modelo_id, v.modelo_id) and mo.org_id = p_org_id
      left join public.viatura_marcas ma on ma.id = mo.marca_id
      left join public.estacoes ee on ee.id = r.estacao_entrega_id and ee.org_id = p_org_id
      left join public.estacoes er on er.id = r.estacao_recolha_id and er.org_id = p_org_id
     where r.id = p_reserva_id and r.org_id = p_org_id);
end $$;

create or replace function public.api_conta_reservas(p_org_id uuid, p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cliente uuid := public.api_conta_cliente_id(p_org_id, p_user_id);
begin
  if v_cliente is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.api_conta_reserva_resumo(p_org_id, r.id)
                     order by r.data_inicio desc, r.codigo desc)
      from public.reservas r
     where r.org_id = p_org_id
       and r.cliente_id = v_cliente
       and r.regime::text = 'rent_a_car'
       and r.deleted_at is null), '[]'::jsonb);
end $$;

-- Como api_cancelar_reserva: só pendente, e cancelar outra vez devolve-a como está.
-- Aqui também só antes do início e só reservas da ficha da conta (do site ou do balcão).
create or replace function public.api_conta_cancelar_reserva(p_org_id uuid, p_user_id uuid, p_codigo bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cliente uuid := public.api_conta_cliente_id(p_org_id, p_user_id);
  v_id uuid;
  v_estado text;
  v_inicio timestamptz;
begin
  if v_cliente is null then
    return public.api_erro('NAO_ENCONTRADO', 'Reserva não encontrada.');
  end if;
  select r.id, r.estado::text, r.data_inicio into v_id, v_estado, v_inicio
    from public.reservas r
   where r.org_id = p_org_id
     and r.codigo = p_codigo
     and r.cliente_id = v_cliente
     and r.regime::text = 'rent_a_car'
     and r.deleted_at is null
   for update;
  if not found then
    return public.api_erro('NAO_ENCONTRADO', 'Reserva não encontrada.');
  end if;
  if v_estado = 'cancelada' then
    return public.api_conta_reserva_resumo(p_org_id, v_id);
  end if;
  if v_estado <> 'pendente' then
    return public.api_erro('ESTADO_INVALIDO', 'A reserva já foi confirmada pela equipa; o cancelamento é feito com ela.');
  end if;
  if v_inicio <= now() then
    return public.api_erro('ESTADO_INVALIDO', 'A reserva já começou; o cancelamento é feito com a equipa.');
  end if;
  update public.reservas set estado = 'cancelada' where id = v_id;
  return public.api_conta_reserva_resumo(p_org_id, v_id);
end $$;

-- Só as faturas emitidas em nome da ficha (destinatário fiscal), não as do
-- contrato: no contrato do titular há faturas ao condutor, com o NIF e a
-- morada dele. Com cobrança, manda o destinatário da cobrança. Sem cobrança,
-- o NIF da fatura tem de ser o da ficha, a ficha tem de estar no contrato
-- (titular ou condutor) e não pode ter nascido no registo
-- (criada_no_registo): o NIF dessa ficha não foi verificado por ninguém.
-- A fatura emitida na reserva pode não ter contrato_id: o contrato vem da
-- cobrança (reserva já convertida) ou não há contrato e vale a reserva.
-- Sem filtro de versão: cada fatura fica na versão em que foi emitida.
create or replace function public.api_conta_faturas(p_org_id uuid, p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cliente uuid := public.api_conta_cliente_id(p_org_id, p_user_id);
  v_nif text;
begin
  if v_cliente is null then
    return '[]'::jsonb;
  end if;
  select regexp_replace(coalesce(c.nif, ''), '\D', '', 'g') into v_nif
    from public.clientes c where c.id = v_cliente and not c.criada_no_registo;
  v_nif := coalesce(v_nif, '');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id,
             'tipo', i.tipo,
             'serie', i.serie,
             'numero', i.numero,
             'data_emissao', i.data_emissao,
             'total', i.total,
             'contrato_codigo', c.codigo,
             'reserva_codigo', r.codigo)
           order by i.data_emissao desc nulls last, i.created_at desc)
      from public.invoices i
      left join public.contrato_cobrancas cb on cb.id = i.cobranca_id and cb.org_id = p_org_id
      left join public.contratos_renting c on c.id = coalesce(i.contrato_id, cb.contrato_id) and c.org_id = p_org_id
      left join public.reservas r on r.id = coalesce(cb.reserva_id, c.reserva_id) and r.org_id = p_org_id
     where i.org_id = p_org_id
       and i.status = 'emitida'
       and case
             when coalesce(i.contrato_id, cb.contrato_id) is not null then c.regime::text = 'rent_a_car'
             else r.regime::text = 'rent_a_car'
           end
       and case
             when i.cobranca_id is not null then cb.destinatario_id = v_cliente
             else v_nif <> ''
                  and regexp_replace(coalesce(i.cliente_nif, ''), '\D', '', 'g') = v_nif
                  and (c.cliente_id = v_cliente
                       or exists (select 1 from public.contrato_condutores cc
                                   where cc.contrato_id = c.id and cc.org_id = p_org_id
                                     and cc.cliente_id = v_cliente))
           end), '[]'::jsonb);
end $$;

create or replace function public.api_conta_fatura(p_org_id uuid, p_user_id uuid, p_invoice_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_fatura jsonb;
begin
  select x into v_fatura
    from jsonb_array_elements(public.api_conta_faturas(p_org_id, p_user_id)) x
   where x->>'id' = p_invoice_id::text;
  return coalesce(v_fatura, public.api_erro('NAO_ENCONTRADO', 'Fatura não encontrada.'));
end $$;

-- ── 8. api_criar_reserva com a conta do cliente ─────────────────────────────
-- Um parâmetro novo com default criava uma segunda função ao lado da antiga
-- (chamada com 3 argumentos ambígua): sai a antiga.
drop function if exists public.api_criar_reserva(uuid, uuid, jsonb);

-- Copiada de 20261015190000; muda só a escolha do cliente: com p_user_id e uma
-- ficha ligada a essa conta nesta org (ou ligada agora), a reserva é dessa
-- ficha, sem procura por NIF/email; a procura sem conta salta as fichas
-- ligadas a uma conta e as nascidas no registo (nasce outra e a equipa vê a
-- divergência). cliente_divergente compara o nome e o NIF
-- do pedido com a ficha; o email é o da conta.
create or replace function public.api_criar_reserva(
  p_org_id uuid, p_api_chave_id uuid, p_pedido jsonb, p_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_ref text := p_pedido->>'referencia_externa';
  v_modelo uuid := (p_pedido->>'modelo_id')::uuid;
  v_inicio timestamptz := (p_pedido->>'inicio')::timestamptz;
  v_fim timestamptz := (p_pedido->>'fim')::timestamptz;
  v_entrega uuid := (p_pedido->>'entrega')::uuid;
  v_recolha uuid := (p_pedido->>'recolha')::uuid;
  v_cobertura uuid := nullif(p_pedido->>'cobertura_id', '')::uuid;
  v_extras jsonb := coalesce(p_pedido->'extras', '[]'::jsonb);
  v_cli jsonb := p_pedido->'cliente';
  v_nif text := nullif(btrim(coalesce(p_pedido->'cliente'->>'nif', '')), '');
  v_email text := lower(btrim(p_pedido->'cliente'->>'email'));
  v_existente uuid; v_emissor uuid; v_cot jsonb; v_total numeric; v_esperado numeric;
  v_cliente uuid; v_cliente_nome text; v_reserva uuid; v_codigo bigint; v_dias int;
  v_m record; v_pr record; v_tarifa uuid; v_tarifa_nome text;
  v_cob_nome text; v_cob_preco numeric; v_cob_franquia numeric;
  v_cliente_email text; v_por_nif boolean := false; v_divergente boolean := false; v_mensagem text;
  v_viatura uuid; v_matricula text;
  v_da_conta boolean := false; v_conta_cliente uuid; v_cliente_nif text;
begin
  -- Sem modelo o lock seria hashtext(null): não serializava nada.
  if v_modelo is null or v_ref is null then
    return public.api_erro('PARAMETRO_INVALIDO', 'modelo_id e referencia_externa são obrigatórios.');
  end if;

  -- Lock antes de tudo: serializa a última viatura do modelo e repetições do mesmo pedido.
  perform pg_advisory_xact_lock(hashtext('api_reserva:' || p_org_id::text || ':' || v_modelo::text));

  select id into v_existente from public.reservas
   where org_id = p_org_id and api_chave_id = p_api_chave_id and referencia_externa = v_ref;
  if found then
    return public.api_reserva_resumo(p_org_id, v_existente) || jsonb_build_object('repetida', true);
  end if;

  select d.emissor_rent_a_car_id into v_emissor
    from public.org_definicoes d
    join public.clientes e on e.id = d.emissor_rent_a_car_id
                          and e.org_id = p_org_id and e.is_emissora and e.deleted_at is null
   where d.org_id = p_org_id;
  if v_emissor is null then
    return public.api_erro('CONFIG_EM_FALTA', 'Empresa emissora das reservas do site por configurar.');
  end if;

  if v_nif is not null and not public.nif_pt_valido(v_nif) then
    return public.api_erro('PARAMETRO_INVALIDO', 'cliente.nif não é um NIF português válido. Clientes estrangeiros omitem-no.');
  end if;

  -- Revalida período, tarifa, extras, cobertura e disponibilidade (já com a procura sem viatura).
  v_cot := public.api_cotacao(p_org_id, v_modelo, v_inicio, v_fim, v_entrega, v_recolha, v_extras, v_cobertura);
  if v_cot ? 'erro' then return v_cot; end if;

  v_total := (v_cot->'subtotal'->>'com_iva')::numeric;
  v_esperado := round((p_pedido->>'total_esperado')::numeric, 2);
  if v_esperado is distinct from v_total then
    return jsonb_set(
      public.api_erro('PRECO_ALTERADO', 'O preço mudou desde a cotação. Confirme o novo total com o cliente.'),
      '{erro,detalhes}', v_cot);
  end if;

  -- Matrícula escolhida já: a reserva passa a ocupar um carro concreto e as
  -- protecções do WeGest (sobreposição, contrato com reserva) valem para ela.
  v_viatura := public.api_escolher_viatura(p_org_id, v_modelo, v_inicio, v_fim);
  if v_viatura is null then
    return public.api_erro('SEM_DISPONIBILIDADE', 'Sem viaturas deste modelo livres nestas datas.');
  end if;
  select matricula into v_matricula from public.viaturas where id = v_viatura;

  select * into v_m from public.api_modelos_publicaveis(p_org_id) where modelo_id = v_modelo;
  v_tarifa := public.api_tarifa_site(p_org_id);
  select nome into v_tarifa_nome from public.renting_tarifas where id = v_tarifa and org_id = p_org_id;
  select * into v_pr from public.renting_tarifa_precos_modelo
   where modelo_id = v_modelo and tarifa_id = v_tarifa and org_id = p_org_id;
  v_dias := (v_cot->'periodo'->>'dias')::int;
  if v_cobertura is not null then
    select nome, preco_dia, franquia_valor into v_cob_nome, v_cob_preco, v_cob_franquia
      from public.renting_coberturas where id = v_cobertura and org_id = p_org_id;
  end if;

  -- Cliente e reserva no mesmo bloco: se o insert da reserva perder a corrida
  -- da idempotência, o cliente novo também é desfeito.
  begin
    -- Conta do site com ficha ligada nesta org: a reserva é dessa ficha. A
    -- função liga/cria: chama-se uma vez, fora do WHERE.
    if p_user_id is not null then
      v_conta_cliente := public.api_conta_cliente_id(p_org_id, p_user_id);
      select id, nome, nif into v_cliente, v_cliente_nome, v_cliente_nif from public.clientes
       where id = v_conta_cliente;
      v_da_conta := v_cliente is not null;
    end if;
    -- Cliente: por NIF, senão por email; o mais antigo; nunca uma emissora; nunca alterado.
    -- Nunca uma ficha ligada a uma conta (nem nascida no registo): o NIF e o
    -- email do pedido anónimo não provam nada, e a reserva ficava à vista dessa conta.
    if not v_da_conta and v_nif is not null then
      select id, nome, email into v_cliente, v_cliente_nome, v_cliente_email from public.clientes
       where org_id = p_org_id and deleted_at is null and not is_emissora and nif = v_nif
         and user_id is null and not criada_no_registo
       order by created_at, id limit 1;
      v_por_nif := v_cliente is not null;
    end if;
    if v_cliente is null then
      select id, nome, email into v_cliente, v_cliente_nome, v_cliente_email from public.clientes
       where org_id = p_org_id and deleted_at is null and not is_emissora and lower(btrim(email)) = v_email
         and user_id is null and not criada_no_registo
       order by created_at, id limit 1;
    end if;
    if v_da_conta then
      -- O email está provado pela conta; o nome e o NIF vêm do formulário.
      v_divergente :=
        lower(regexp_replace(btrim(v_cliente_nome), '\s+', ' ', 'g'))
          is distinct from lower(regexp_replace(btrim(v_cli->>'nome'), '\s+', ' ', 'g'))
        or (v_nif is not null
            and regexp_replace(v_nif, '\D', '', 'g')
                is distinct from nullif(regexp_replace(coalesce(v_cliente_nif, ''), '\D', '', 'g'), ''));
    elsif v_cliente is not null then
      -- Liga e avisa: a ficha não muda, mas a equipa confirma a identidade ao balcão.
      v_divergente :=
        lower(regexp_replace(btrim(v_cliente_nome), '\s+', ' ', 'g'))
          is distinct from lower(regexp_replace(btrim(v_cli->>'nome'), '\s+', ' ', 'g'))
        or (v_por_nif and v_cliente_email is not null
            and lower(btrim(v_cliente_email)) is distinct from v_email);
    else
      insert into public.clientes (org_id, nome, email, telefone, nif, data_nascimento, morada,
                                   codigo_postal, localidade, pais, tipo_cliente, created_by)
      values (p_org_id, btrim(v_cli->>'nome'), v_email, btrim(v_cli->>'telefone'), v_nif,
              (v_cli->>'data_nascimento')::date, nullif(btrim(v_cli->>'morada'), ''),
              nullif(btrim(v_cli->>'codigo_postal'), ''), nullif(btrim(v_cli->>'localidade'), ''),
              coalesce(nullif(btrim(v_cli->>'pais'), ''), 'Portugal'), 'particular', null)
      returning id, nome into v_cliente, v_cliente_nome;
    end if;

    insert into public.reservas (
      org_id, estado, regime, modelo_id, viatura_id, matricula, grupo_id, grupo_nome,
      data_inicio, data_fim, estacao_entrega_id, estacao_recolha_id,
      cliente_id, cliente_nome, condutor_nome, emissor_id,
      tarifa_id, tarifa_nome, tarifa_preco_dia,
      cobertura_id, cobertura_nome, cobertura_preco_dia, cobertura_franquia,
      valor_total, valor_total_manual, franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
      observacoes, origem, api_chave_id, referencia_externa, dados_site, created_by, gestor_id)
    values (
      p_org_id, 'pendente', 'rent_a_car', v_modelo, v_viatura, v_matricula, v_m.grupo_id, v_m.grupo_nome,
      v_inicio, v_fim, v_entrega, v_recolha,
      v_cliente, v_cliente_nome, v_cliente_nome, v_emissor,
      v_tarifa, v_tarifa_nome, v_m.preco_dia,
      v_cobertura, v_cob_nome, v_cob_preco, v_cob_franquia,
      round(v_m.preco_dia * v_dias, 2), round(v_m.preco_dia * v_dias, 2),
      case when v_cobertura is not null then v_cob_franquia else v_pr.franquia_valor end,
      v_pr.caucao_valor, v_pr.km_mensal, v_pr.km_adicional_valor,
      nullif(btrim(p_pedido->>'mensagem'), ''), 'site', p_api_chave_id, v_ref,
      jsonb_build_object('cliente', v_cli, 'carta_conducao', p_pedido->'carta_conducao',
                         'mensagem', p_pedido->>'mensagem', 'total_esperado', v_esperado, 'cotacao', v_cot,
                         'cliente_divergente', v_divergente),
      null, null)
    returning id, codigo into v_reserva, v_codigo;
  exception when unique_violation then
    -- O mesmo pedido noutro modelo (outro lock) chegou primeiro: devolve o que existe.
    select id into v_existente from public.reservas
     where org_id = p_org_id and api_chave_id = p_api_chave_id and referencia_externa = v_ref;
    if v_existente is null then raise; end if;
    return public.api_reserva_resumo(p_org_id, v_existente) || jsonb_build_object('repetida', true);
  when exclusion_violation then
    -- O balcão reservou o mesmo carro entre a escolha e o insert.
    return public.api_erro('SEM_DISPONIBILIDADE', 'Sem viaturas deste modelo livres nestas datas.');
  end;

  insert into public.reserva_extras (org_id, reserva_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total)
  select p_org_id, v_reserva, e.id, e.nome, e.preco_unidade, e.tipo_calculo, (x->>'quantidade')::int,
         round(e.preco_unidade * (x->>'quantidade')::int * case when e.tipo_calculo = 'dia' then v_dias else 1 end, 2)
    from jsonb_array_elements(v_extras) x
    join public.renting_extras e on e.id = (x->>'extra_id')::uuid and e.org_id = p_org_id;

  if v_cobertura is not null then
    insert into public.reserva_coberturas (org_id, reserva_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor)
    values (p_org_id, v_reserva, v_cobertura, v_cob_nome, v_cob_preco, v_cob_franquia);
  end if;

  insert into public.reserva_condutores (org_id, reserva_id, cliente_id, is_principal)
  values (p_org_id, v_reserva, v_cliente, true);

  v_mensagem := 'Reserva #' || v_codigo || ' do site: ' || v_m.marca || ' ' || v_m.modelo || ', '
                || to_char(v_inicio at time zone 'Europe/Lisbon', 'DD/MM HH24:MI') || ' a '
                || to_char(v_fim at time zone 'Europe/Lisbon', 'DD/MM HH24:MI') || ', ' || v_cliente_nome
                || '. Viatura proposta: ' || v_matricula || '. Confirmar ou trocar.';
  if v_divergente then
    v_mensagem := v_mensagem || ' Dados do site diferentes da ficha do cliente: confirmar identidade ao balcão.';
  end if;

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  values (p_org_id, 'reserva.site_recebida', 'reservas', v_reserva, jsonb_build_object(
    'codigo', v_codigo,
    'modelo', v_m.marca || ' ' || v_m.modelo,
    'cliente', v_cliente_nome,
    'cliente_divergente', v_divergente,
    'data_inicio', v_inicio,
    'data_fim', v_fim,
    'total', v_total,
    'mensagem', v_mensagem),
    'edge_function');

  return public.api_reserva_resumo(p_org_id, v_reserva);
end $$;

-- ── 9. Permissões das chaves ────────────────────────────────────────────────
-- Igual à 20261009100000, só com a whitelist alargada à conta do cliente.
create or replace function public.api_chaves_criar(
  p_nome text, p_escopo text, p_permissoes text[], p_expira_em timestamptz, p_ip_whitelist text[]
) returns table (id uuid, chave text, prefixo text)
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.get_current_org_id();
  v_chave text;
  v_id uuid;
begin
  if v_org is null or not public.is_current_user_admin() then
    raise exception 'Só administradores da organização criam chaves de API';
  end if;
  if not coalesce(p_permissoes, '{}') <@ array['catalogo:read', 'disponibilidade:read', 'reservas:read', 'reservas:write',
                                               'tvde:catalogo:read', 'tvde:candidaturas:read', 'tvde:candidaturas:write',
                                               'conta:read', 'conta:write'] then
    raise exception 'Permissão desconhecida';
  end if;
  if p_expira_em is not null and p_expira_em <= now() then
    raise exception 'Expiração no passado';
  end if;
  v_chave := 'wg_ra_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_chaves
    (org_id, nome, escopo, permissoes, ativo, ip_whitelist, rate_limit_per_minute,
     expires_at, api_key_hash, prefixo, created_by)
  values
    (v_org, p_nome, p_escopo, coalesce(p_permissoes, '{}'), true, p_ip_whitelist, 120,
     p_expira_em, encode(extensions.digest(v_chave, 'sha256'), 'hex'), left(v_chave, 10), auth.uid())
  returning api_chaves.id into v_id;
  return query select v_id, v_chave, left(v_chave, 10);
end $$;

-- ── 10. Grants ──────────────────────────────────────────────────────────────
-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated (e service_role) em cada função nova. Nomeiam-se todos.

-- api_chaves_criar é do browser (admin): mantém os grants da 20261001100000.
revoke execute on function public.api_chaves_criar(text, text, text[], timestamptz, text[]) from public, anon;
grant execute on function public.api_chaves_criar(text, text, text[], timestamptz, text[]) to authenticated;

-- Só os triggers e api_conta_cliente_id (dono da base) chamam a ligação.
revoke execute on function public.cliente_ligar_conta(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.cliente_conta_confirmada() from public, anon, authenticated, service_role;
revoke execute on function public.clientes_user_id_so_pelo_servidor() from public, anon, authenticated, service_role;
revoke execute on function public.profiles_tipo_cliente_so_pelo_servidor() from public, anon, authenticated, service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'api_conta_cliente_id(uuid, uuid)',
    'api_conta(uuid, uuid)',
    'api_conta_reserva_resumo(uuid, uuid)',
    'api_conta_reservas(uuid, uuid)',
    'api_conta_cancelar_reserva(uuid, uuid, bigint)',
    'api_conta_faturas(uuid, uuid)',
    'api_conta_fatura(uuid, uuid, uuid)',
    'api_criar_reserva(uuid, uuid, jsonb, uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
