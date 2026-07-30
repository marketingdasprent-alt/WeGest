-- ============================================================
-- ROLLBACK de 20260730084227_isolamento_anon_causa_raiz.sql
-- ============================================================
-- NÃO APLICAR salvo se a verificação pós-migração falhar.
--
-- Escrito antes da migração que reverte, de propósito: se a correcção
-- partir um fluxo anónimo que não foi mapeado, o caminho de volta tem de
-- existir sem ter de ser inventado à pressa.
--
-- Repõe o estado exacto de 2026-07-30, incluindo os grants largos e a
-- política de inserção de leads sem restrição de org. Não é um estado bom
-- — é o estado anterior.
-- ============================================================

-- Camada 4 — repor a política permissiva de inserção de leads
create policy "Qualquer um pode criar leads" on public.leads_dasprent
  for insert to public
  with check (true);

-- Camada 3 — retirar a RPC e devolver a leitura directa das tabelas
drop function if exists public.formulario_publico_por_id(uuid);
grant select on public.formularios to anon;
grant select on public.formulario_campanhas to anon;

-- Camada 2 — apagar a rede de segurança
do $$
declare r record;
begin
  for r in
    select tablename from pg_policies
    where schemaname = 'public' and policyname = 'rls_deny_anon'
  loop
    execute format('drop policy rls_deny_anon on public.%I', r.tablename);
  end loop;
end $$;

-- Camada 1 — reabrir a torneira
alter default privileges in schema public grant all on tables to anon;
alter default privileges in schema public grant all on sequences to anon;
grant all on all tables in schema public to anon;
grant all on all sequences in schema public to anon;
