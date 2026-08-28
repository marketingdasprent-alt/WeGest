-- ============================================================
-- Escalada de privilégios: um PATCH ao próprio perfil dá admin
-- ============================================================
-- Detectada a 2026-07-30 ao mapear os fluxos anónimos. A cadeia NÃO foi
-- executada de propósito — escalava privilégios a sério em produção. Cada elo
-- está confirmado por leitura do catálogo; a composição é dedução directa.
--
-- CADEIA PRINCIPAL (qualquer utilizador -> admin da sua org)
--   1. `Users can update their own profile` em profiles tem
--      qual = (auth.uid() = id) e NENHUM with_check. Num UPDATE o Postgres
--      reutiliza o USING como check, e não há restrição de coluna: o
--      utilizador escreve qualquer coluna do seu próprio perfil, cargo_id
--      incluído.
--   2. trg_mirror_profile_role (AFTER UPDATE OF cargo_id em profiles) copia
--      o cargo_id para user_organizacoes.
--   3. trg_uorg_sync_is_admin (BEFORE UPDATE OF cargo_id em
--      user_organizacoes) põe is_admin = (nome do cargo ILIKE '%admin%').
--   4. is_current_user_admin() lê user_organizacoes.is_admin, e
--      has_permission() devolve true a tudo no primeiro ramo quando is_admin
--      é verdadeiro.
--   Ambos os triggers são SECURITY DEFINER, por isso a RLS de
--   user_organizacoes não os travava.
--
-- CADEIA DE ENTRADA (rua -> membro de qualquer org, com o cargo que pedir)
--   handle_new_user_org aceita org_id e cargo_id de raw_user_meta_data, que é
--   o `options.data` do signUp. Com `disable_signup: false` e
--   `mailer_autoconfirm: true` (GET /auth/v1/settings), qualquer pessoa se
--   registava directamente na organização que indicasse, com o cargo que
--   indicasse.
--
-- FORENSE: só 2 contas usaram is_first_user na metadata, ambas a 2025-06-03,
-- o dia genuíno do arranque. As 91 linhas de user_org_ativa têm todas
-- associação correspondente em user_organizacoes. Sem sinais de exploração.
-- ============================================================

-- ------------------------------------------------------------
-- ELO 1 — o próprio utilizador não altera os seus privilégios
-- ------------------------------------------------------------
-- Não se resolve com `with check` na política: uma política de UPDATE não
-- consegue comparar o valor antigo com o novo (não há OLD no with check).
-- Não se resolve com `revoke update (cargo_id) ... from authenticated`: os
-- grants são por papel, não por linha, e isso tiraria a coluna aos admins
-- legítimos, que precisam dela para gerir colaboradores.
--
-- Fica um trigger que reverte os campos de privilégio quando quem escreve é o
-- próprio e não é admin da org. `auth.uid()` é nulo em service_role, logo as
-- edge functions e o tooling não são afectados.
create or replace function public.profiles_bloqueia_auto_escalada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() = new.id and not public.is_current_user_admin() then
    new.cargo_id        := old.cargo_id;
    new.cargo           := old.cargo;
    new.is_admin        := old.is_admin;
    new.org_id          := old.org_id;
    new.tipo_utilizador := old.tipo_utilizador;
  end if;
  return new;
end;
$function$;

comment on function public.profiles_bloqueia_auto_escalada() is
  'Impede auto-escalada: um utilizador não-admin não altera cargo_id, cargo, '
  'is_admin, org_id nem tipo_utilizador no seu próprio perfil. Sem isto, um '
  'PATCH a profiles.cargo_id propagava-se por trg_mirror_profile_role para '
  'user_organizacoes e trg_uorg_sync_is_admin dava is_admin=true.';

-- O nome ordena antes de trg_sync_is_admin ('b' < 's'), o que é necessário:
-- este reverte o cargo_id primeiro, e o sync recalcula is_admin a partir do
-- valor já revertido em vez do valor pedido.
drop trigger if exists trg_profiles_bloqueia_auto_escalada on public.profiles;
create trigger trg_profiles_bloqueia_auto_escalada
  before update on public.profiles
  for each row execute function public.profiles_bloqueia_auto_escalada();

-- ------------------------------------------------------------
-- ELO 2 — o registo não escolhe um cargo privilegiado
-- ------------------------------------------------------------
-- handle_new_user_org resolve primeiro o cargo a partir de um convite válido
-- (por email, não usado), e só recorre à metadata se não houver convite. É
-- esse ramo que o ataque usava.
--
-- O caminho legítimo tem de continuar a funcionar: /motorista/registo faz
-- signUp com cargo_id = CARGO_MOTORISTA_ID e cargo_nome = 'Motorista'
-- (src/pages/motorista/RegistoMotorista.tsx:237-242), e org_id resolvido pelo
-- código da org (src/lib/org-codigo.ts). Por isso não se bloqueia a metadata:
-- bloqueia-se apenas que ela nomeie um cargo administrativo.
--
-- Mantida igual ao original em tudo o resto, de propósito.
create or replace function public.handle_new_user_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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

    -- Sem convite válido, o cargo vem do cliente e não pode ser privilegiado.
    -- Mesmo critério que sync_uorg_is_admin_from_cargo usa para dar is_admin.
    if coalesce(_cargo_nome, '') ilike '%admin%' then
      _cargo_id := null;
      _cargo_nome := null;
    end if;
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
$function$;

-- ------------------------------------------------------------
-- Defesa em profundidade — a org activa pertence ao utilizador
-- ------------------------------------------------------------
-- Não fecha nenhuma das cadeias acima por si (o atacante ficava membro
-- genuíno da org, logo satisfazia esta condição em vez de a violar), mas
-- elimina a variante em que um utilizador já existente aponta a sua org activa
-- para uma organização a que não pertence.
--
-- RESTRICTIVE, soma-se à permissiva existente (`User gere a sua org ativa`,
-- que garante user_id = auth.uid()). Verificado antes de aplicar: as 91 linhas
-- actuais têm todas associação correspondente, por isso o `using` não esconde
-- nada e não parte sessões.
drop policy if exists rls_org_ativa_tem_de_pertencer_ao_user on public.user_org_ativa;
create policy rls_org_ativa_tem_de_pertencer_ao_user on public.user_org_ativa
  as restrictive for all to authenticated
  using (
    exists (
      select 1 from public.user_organizacoes uo
      where uo.user_id = user_org_ativa.user_id
        and uo.org_id  = user_org_ativa.org_id
    )
  )
  with check (
    exists (
      select 1 from public.user_organizacoes uo
      where uo.user_id = user_org_ativa.user_id
        and uo.org_id  = user_org_ativa.org_id
    )
  );

-- ------------------------------------------------------------
-- Reversão
-- ------------------------------------------------------------
-- Sem ficheiro de rollback de propósito: seria um script pronto a correr que
-- reintroduz uma escalada de privilégios. Se for preciso reverter:
--
--   drop trigger trg_profiles_bloqueia_auto_escalada on public.profiles;
--   drop policy rls_org_ativa_tem_de_pertencer_ao_user on public.user_org_ativa;
--
-- e para handle_new_user_org, retirar o bloco `ilike '%admin%'`.

-- ------------------------------------------------------------
-- Registado, não corrigido aqui
-- ------------------------------------------------------------
-- 1. `handle_new_user` contém a mesma falha na versão antiga
--    (is_admin vindo de raw_user_meta_data->>'is_first_user'), mas NÃO está
--    ligada a nenhum trigger: o único trigger em auth.users é
--    on_auth_user_created_org. É código morto. Deixada intacta para não
--    misturar remoção de código morto com uma correcção de segurança, mas é
--    uma armadilha para quem a religar.
--
-- 2. `organizacoes.codigo` é legível por anon (é o grant que o login por
--    código precisa), por isso os códigos das 5 orgs são enumeráveis e não
--    funcionam como segredo. Fechar isso obriga a uma RPC e a mudar 3 sítios
--    no frontend (Login.tsx, RegistarOrg.tsx, lib/org-codigo.ts).
--
-- 3. `disable_signup: false` é configuração do Auth, não da base de dados, e
--    não deve ser desligada às cegas: /motorista/registo usa signUp e é uma
--    rota pública legítima.
