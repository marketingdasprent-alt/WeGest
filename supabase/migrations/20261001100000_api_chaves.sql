-- ============================================================
-- Chaves de API genéricas (era primavera_api_keys) + auditoria de pedidos
-- ============================================================
-- A API externa de rent-a-car precisa de chaves por organização. A tabela já
-- existia com o nome do Primavera; passa a genérica, com escopo e hash.
-- A chave em claro só sai uma vez, na criação. Ninguém apaga: desactiva-se.
--
-- Aplicar à mão no SQL Editor e, LOGO A SEGUIR, republicar a primavera-api
-- (lê 'primavera_api_keys' até ser redeployada). Hoje: 1 chave, nunca usada,
-- 0 pedidos registados.
-- ============================================================

alter table public.primavera_api_keys rename to api_chaves;

alter table public.api_chaves
  add column if not exists escopo text not null default 'contabilidade'
    check (escopo in ('contabilidade', 'rent_a_car')),
  add column if not exists api_key_hash text,
  add column if not exists prefixo text,
  alter column api_key drop not null;

alter table public.api_chaves alter column escopo drop default;

create unique index if not exists api_chaves_hash_unico
  on public.api_chaves (api_key_hash) where api_key_hash is not null;

comment on table public.api_chaves is
  'Chaves da API externa por organização. Linhas com api_key em claro são do Primavera (legado); as novas guardam só api_key_hash.';

-- RLS: admins da própria org. Sem DELETE.
alter table public.api_chaves enable row level security;
drop policy if exists api_chaves_select on public.api_chaves;
create policy api_chaves_select on public.api_chaves for select to authenticated
  using (org_id = public.get_current_org_id() and public.is_current_user_admin());
drop policy if exists api_chaves_update on public.api_chaves;
create policy api_chaves_update on public.api_chaves for update to authenticated
  using (org_id = public.get_current_org_id() and public.is_current_user_admin())
  with check (org_id = public.get_current_org_id());

-- A política antiga "Admins podem gerir API keys" (FOR ALL) e o GRANT ALL a
-- authenticated vinham do Primavera e seguem a tabela no rename: deixavam
-- INSERT e DELETE pelo browser. Só ficam as duas políticas acima, e os
-- privilégios passam a ser por coluna: o browser lê o que se mostra na lista
-- e altera o que se edita. api_key, api_secret e api_key_hash nunca saem
-- pelo PostgREST; criar é só pela RPC.
drop policy if exists "Admins podem gerir API keys" on public.api_chaves;
revoke insert, update, delete, truncate, references, trigger on public.api_chaves from authenticated, anon;
grant update (nome, ativo, ip_whitelist, expires_at, permissoes) on public.api_chaves to authenticated;
revoke select on public.api_chaves from authenticated;
grant select (id, org_id, nome, escopo, permissoes, ativo, ip_whitelist, rate_limit_per_minute,
              expires_at, last_used_at, total_requests, created_at, created_by, prefixo)
  on public.api_chaves to authenticated;

-- Chaves antigas (Primavera, api_key em claro) passam a resolver também por hash,
-- para a API de rent-a-car as reconhecer e recusar por escopo (403) em vez de 401.
update public.api_chaves
   set api_key_hash = encode(extensions.digest(api_key, 'sha256'), 'hex'),
       prefixo = coalesce(prefixo, left(api_key, 10))
 where api_key is not null and api_key_hash is null;

-- Criar: só por RPC, para a chave nunca ser escolhida pelo browser.
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
  if not coalesce(p_permissoes, '{}') <@ array['catalogo:read', 'disponibilidade:read', 'reservas:read', 'reservas:write'] then
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

create or replace function public.api_chaves_desativar(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.api_chaves set ativo = false
   where id = p_id and org_id = public.get_current_org_id() and public.is_current_user_admin();
$$;

-- Lida pela edge function com service_role; devolve o necessário para autenticar.
create or replace function public.api_chave_por_hash(p_hash text)
returns table (id uuid, org_id uuid, nome text, escopo text, permissoes text[], ativo boolean,
               ip_whitelist text[], rate_limit_per_minute int, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.org_id, c.nome, c.escopo, c.permissoes, c.ativo, c.ip_whitelist,
         c.rate_limit_per_minute, c.expires_at
    from public.api_chaves c where c.api_key_hash = p_hash;
$$;

-- Auditoria: sem corpo, sem dados de cliente. 30 dias.
create table if not exists public.api_pedidos (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizacoes(id) on delete cascade,
  api_chave_id uuid references public.api_chaves(id) on delete set null,
  metodo text not null,
  caminho text not null,
  estado_http smallint not null,
  duracao_ms integer,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists api_pedidos_chave_data on public.api_pedidos (api_chave_id, created_at desc);
alter table public.api_pedidos enable row level security;
drop policy if exists api_pedidos_select on public.api_pedidos;
create policy api_pedidos_select on public.api_pedidos for select to authenticated
  using (org_id = public.get_current_org_id() and public.is_current_user_admin());

-- As duas políticas estruturais que rls_org_isolation.test.sql e
-- rls_anon_exposure.test.sql exigem a toda a tabela com org_id.
drop policy if exists rls_deny_anon on public.api_pedidos;
create policy rls_deny_anon on public.api_pedidos as restrictive to anon
  using (false) with check (false);
drop policy if exists rls_org_isolation on public.api_pedidos;
create policy rls_org_isolation on public.api_pedidos as restrictive to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id is null or org_id = public.get_current_org_id());

-- Só a edge function (service_role) escreve; o browser lê. A sequência da
-- identidade também fica fechada: sem ela não há nextval pelo PostgREST.
revoke insert, update, delete, truncate, references, trigger on public.api_pedidos from authenticated, anon;
revoke all on sequence public.api_pedidos_id_seq from authenticated;

select cron.schedule('api_pedidos_retencao', '17 3 * * *',
  $$ delete from public.api_pedidos where created_at < now() - interval '30 days' $$)
where not exists (select 1 from cron.job where jobname = 'api_pedidos_retencao');

revoke execute on function public.api_chaves_criar(text, text, text[], timestamptz, text[]) from public, anon;
grant execute on function public.api_chaves_criar(text, text, text[], timestamptz, text[]) to authenticated;
revoke execute on function public.api_chaves_desativar(uuid) from public, anon;
grant execute on function public.api_chaves_desativar(uuid) to authenticated;
revoke execute on function public.api_chave_por_hash(text) from public, anon, authenticated;
grant execute on function public.api_chave_por_hash(text) to service_role;

notify pgrst, 'reload schema';
