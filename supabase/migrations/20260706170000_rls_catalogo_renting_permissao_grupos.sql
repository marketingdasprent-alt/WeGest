-- ============================================================
-- Catálogo de renting (coberturas, extras, taxas) na permissão "viaturas_grupos"
-- ============================================================
-- Auditoria das políticas: renting_coberturas / renting_extras / renting_taxas
-- tinham INSERT/UPDATE/DELETE ADMIN-ONLY (só is_current_user_admin()), tal como
-- os grupos/tarifas estavam — logo um gestor levava "new row violates row-level
-- security policy" ao criar/editar uma cobertura/extra/taxa.
--
-- Passam a usar o mesmo recurso dedicado "viaturas_grupos" (nível Editar), que
-- fica a governar todo o catálogo de config do renting. A isolação por org
-- mantém-se.
--
-- Idempotente. Aplicar à mão no SQL editor.
-- ============================================================

-- Âmbito da permissão passa a incluir coberturas/extras/taxas.
update public.recursos
set descricao = 'Criar/editar grupos, tarifas, coberturas, extras e taxas de renting'
where nome = 'viaturas_grupos';

-- ── renting_coberturas ──────────────────────────────────────
drop policy if exists mt_renting_coberturas_insert on public.renting_coberturas;
create policy mt_renting_coberturas_insert on public.renting_coberturas for insert to authenticated
  with check (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));
drop policy if exists mt_renting_coberturas_update on public.renting_coberturas;
create policy mt_renting_coberturas_update on public.renting_coberturas for update to authenticated
  using (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));
drop policy if exists mt_renting_coberturas_delete on public.renting_coberturas;
create policy mt_renting_coberturas_delete on public.renting_coberturas for delete to authenticated
  using (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));

-- ── renting_extras ──────────────────────────────────────────
drop policy if exists mt_renting_extras_insert on public.renting_extras;
create policy mt_renting_extras_insert on public.renting_extras for insert to authenticated
  with check (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));
drop policy if exists mt_renting_extras_update on public.renting_extras;
create policy mt_renting_extras_update on public.renting_extras for update to authenticated
  using (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));
drop policy if exists mt_renting_extras_delete on public.renting_extras;
create policy mt_renting_extras_delete on public.renting_extras for delete to authenticated
  using (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));

-- ── renting_taxas ───────────────────────────────────────────
drop policy if exists mt_renting_taxas_insert on public.renting_taxas;
create policy mt_renting_taxas_insert on public.renting_taxas for insert to authenticated
  with check (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));
drop policy if exists mt_renting_taxas_update on public.renting_taxas;
create policy mt_renting_taxas_update on public.renting_taxas for update to authenticated
  using (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));
drop policy if exists mt_renting_taxas_delete on public.renting_taxas;
create policy mt_renting_taxas_delete on public.renting_taxas for delete to authenticated
  using (org_id = get_current_org_id() and has_permission_edit(auth.uid(), 'viaturas_grupos'));
