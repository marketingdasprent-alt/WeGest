-- ============================================================
-- Permissão dedicada: "Grupos de viaturas"
-- ============================================================
-- Cria um recurso próprio (aparece na lista de permissões dos cargos, na
-- secção Viaturas) para gerir grupos e tarifas de viaturas — em vez de
-- reutilizar as permissões de viaturas. O RLS de renting_grupos/renting_tarifas
-- passa a exigir o nível "Editar" deste recurso (ou admin).
--
-- Idempotente. Aplicar à mão no SQL editor.
-- ============================================================

-- 1) Recurso global (a tabela recursos não tem org_id — serve todas as orgs).
insert into public.recursos (nome, categoria, descricao)
select 'viaturas_grupos', 'Viaturas', 'Criar, editar e eliminar grupos e tarifas de viaturas'
where not exists (select 1 from public.recursos where nome = 'viaturas_grupos');

-- 2) Helper: permissão de EDIÇÃO de um recurso (tem_acesso + pode_editar).
--    Admin da org passa sempre. Espelha has_permission mas exige o nível "Editar".
create or replace function public.has_permission_edit(_user_id uuid, _recurso text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  _cargo_id uuid;
  _org_id uuid;
begin
  _org_id := get_current_org_id();

  if exists (
    select 1 from public.user_organizacoes
    where user_id = _user_id and org_id = _org_id and is_admin = true
  ) then
    return true;
  end if;

  select cargo_id into _cargo_id
  from public.user_organizacoes
  where user_id = _user_id and org_id = _org_id;

  if _cargo_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.cargo_permissoes cp
    join public.recursos r on cp.recurso_id = r.id
    where cp.cargo_id = _cargo_id
      and r.nome = _recurso
      and cp.tem_acesso = true
      and cp.pode_editar = true
  );
end;
$$;

grant execute on function public.has_permission_edit(uuid, text) to authenticated;

-- 3) RLS: grupos e tarifas passam a usar o recurso dedicado "viaturas_grupos".
drop policy if exists mt_renting_grupos_insert on public.renting_grupos;
create policy mt_renting_grupos_insert on public.renting_grupos
  for insert to authenticated
  with check (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));

drop policy if exists mt_renting_grupos_update on public.renting_grupos;
create policy mt_renting_grupos_update on public.renting_grupos
  for update to authenticated
  using (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));

drop policy if exists mt_renting_grupos_delete on public.renting_grupos;
create policy mt_renting_grupos_delete on public.renting_grupos
  for delete to authenticated
  using (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));

drop policy if exists mt_renting_tarifas_insert on public.renting_tarifas;
create policy mt_renting_tarifas_insert on public.renting_tarifas
  for insert to authenticated
  with check (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));

drop policy if exists mt_renting_tarifas_update on public.renting_tarifas;
create policy mt_renting_tarifas_update on public.renting_tarifas
  for update to authenticated
  using (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));

drop policy if exists mt_renting_tarifas_delete on public.renting_tarifas;
create policy mt_renting_tarifas_delete on public.renting_tarifas
  for delete to authenticated
  using (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));
