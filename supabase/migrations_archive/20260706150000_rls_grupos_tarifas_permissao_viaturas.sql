-- ============================================================
-- RLS: gerir Grupos e Tarifas de viaturas com a permissão de viaturas
-- ============================================================
-- Os Grupos (renting_grupos) e Tarifas (renting_tarifas) são config de frota
-- e estavam ADMIN-ONLY (mt_*_insert/update/delete exigiam is_current_user_admin()),
-- ao contrário da tabela `viaturas`, que já permite:
--   is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_criar'/'editar'/'eliminar')
--
-- Resultado: um gestor com permissão para gerir viaturas levava
-- "new row violates row-level security policy for table renting_grupos"
-- ao criar/editar um grupo. Alinhamos as duas tabelas com o padrão das
-- viaturas — a isolação por org (RESTRICTIVE rls_org_isolation) mantém-se.
--
-- Idempotente. Aplicar à mão no SQL editor.
-- ============================================================

-- ── renting_grupos ──────────────────────────────────────────
drop policy if exists mt_renting_grupos_insert on public.renting_grupos;
create policy mt_renting_grupos_insert on public.renting_grupos
  for insert to authenticated
  with check (
    org_id = get_current_org_id()
    and (is_current_user_admin() or has_permission(auth.uid(), 'viaturas_criar'))
  );

drop policy if exists mt_renting_grupos_update on public.renting_grupos;
create policy mt_renting_grupos_update on public.renting_grupos
  for update to authenticated
  using (
    org_id = get_current_org_id()
    and (is_current_user_admin() or has_permission(auth.uid(), 'viaturas_editar'))
  );

drop policy if exists mt_renting_grupos_delete on public.renting_grupos;
create policy mt_renting_grupos_delete on public.renting_grupos
  for delete to authenticated
  using (
    org_id = get_current_org_id()
    and (is_current_user_admin() or has_permission(auth.uid(), 'viaturas_eliminar'))
  );

-- ── renting_tarifas (mesma família de config; editadas no mesmo fluxo) ──
drop policy if exists mt_renting_tarifas_insert on public.renting_tarifas;
create policy mt_renting_tarifas_insert on public.renting_tarifas
  for insert to authenticated
  with check (
    org_id = get_current_org_id()
    and (is_current_user_admin() or has_permission(auth.uid(), 'viaturas_criar'))
  );

drop policy if exists mt_renting_tarifas_update on public.renting_tarifas;
create policy mt_renting_tarifas_update on public.renting_tarifas
  for update to authenticated
  using (
    org_id = get_current_org_id()
    and (is_current_user_admin() or has_permission(auth.uid(), 'viaturas_editar'))
  );

drop policy if exists mt_renting_tarifas_delete on public.renting_tarifas;
create policy mt_renting_tarifas_delete on public.renting_tarifas
  for delete to authenticated
  using (
    org_id = get_current_org_id()
    and (is_current_user_admin() or has_permission(auth.uid(), 'viaturas_eliminar'))
  );
