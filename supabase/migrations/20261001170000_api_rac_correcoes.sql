-- ============================================================
-- API rent-a-car: duas correcções à Fase A (já aplicada em produção)
-- ============================================================
-- 1. Advisor function_search_path_mutable: api_preco_json não fixava o
--    search_path. Não lê tabelas, por isso fica com search_path vazio.
-- 2. Achado M3 do Vigia por aplicar: a listagem do bucket modelos-viaturas
--    passa a ser só da pasta da própria organização. As imagens continuam a
--    servir-se por /object/public/, que não passa por esta política.
-- Não mexe nas migrações 20261001100000/110000/120000.
-- ============================================================

create or replace function public.api_preco_json(p_valor numeric, p_iva numeric)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p_valor is null then null else jsonb_build_object(
    'sem_iva', round(p_valor, 2),
    'com_iva', round(p_valor * (1 + coalesce(p_iva, 0) / 100), 2),
    'iva', coalesce(p_iva, 0)) end;
$$;

revoke execute on function public.api_preco_json(numeric, numeric) from public, anon, authenticated;
grant execute on function public.api_preco_json(numeric, numeric) to service_role;

drop policy if exists modelos_viaturas_leitura on storage.objects;
create policy modelos_viaturas_leitura on storage.objects for select to authenticated
  using (bucket_id = 'modelos-viaturas'
         and (storage.foldername(name))[1] = public.get_current_org_id()::text);

notify pgrst, 'reload schema';
