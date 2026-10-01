-- Uma conta existente entra noutra org apenas por aceitação autenticada do titular.
create or replace function public.marcar_convite_usado(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_convite public.convites%rowtype;
  v_cargo_nome text;
begin
  if v_user_id is null then return false; end if;
  select lower(trim(u.email)) into v_email from auth.users u
  where u.id = v_user_id and u.email_confirmed_at is not null;
  if v_email is null then return false; end if;

  select c.* into v_convite from public.convites c
  where c.token = p_token and c.usado = false and c.expires_at > now()
    and lower(trim(c.email)) = v_email
  for update;
  if not found or v_convite.org_id is null then return false; end if;
  if not exists (select 1 from public.organizacoes o where o.id = v_convite.org_id and o.ativa) then
    return false;
  end if;
  if v_convite.cargo_id is not null then
    select c.nome into v_cargo_nome from public.cargos c
    where c.id = v_convite.cargo_id and
      (c.org_id = v_convite.org_id or c.id = 'a0000000-0000-0000-0000-000000000001'::uuid);
    if not found then return false; end if;
  end if;

  insert into public.user_organizacoes (user_id, org_id, role, cargo_id, is_admin)
  values (v_user_id, v_convite.org_id, 'member', v_convite.cargo_id,
    coalesce(v_cargo_nome, '') ilike '%admin%')
  on conflict (user_id, org_id) do nothing;
  update public.convites set usado = true where id = v_convite.id;
  return true;
end;
$$;

revoke execute on function public.marcar_convite_usado(text) from public, anon;
grant execute on function public.marcar_convite_usado(text) to authenticated, service_role;

-- Impede contornar o convite por INSERT ou reatribuição de uma pertença existente via REST.
revoke insert, update on public.user_organizacoes from public, anon, authenticated;
grant update (cargo_id, is_admin, role) on public.user_organizacoes to authenticated;

-- Criar convites exige ser admin da org activa. profiles.is_admin é global: um
-- admin da org B que fosse membro sem admin na A criava na A convites de
-- Administrador — e o convite aceite passa agora a trazer contas existentes.
drop policy if exists mt_convites_admin_manage on public.convites;
create policy mt_convites_admin_manage on public.convites
  for all to authenticated
  using (
    (org_id = public.get_current_org_id() and public.is_current_user_admin())
    or public.is_decada_ousada_admin()
  )
  with check (
    (org_id = public.get_current_org_id() and public.is_current_user_admin())
    or public.is_decada_ousada_admin()
  );

notify pgrst, 'reload schema';
