-- ============================================================
-- Auditoria RLS — isolamento multi-tenant (READ-ONLY)
-- ============================================================
-- Para quem NÃO tem Docker: cola isto no SQL editor do Supabase.
-- É 100% leitura de catálogo — não escreve nada, seguro em produção.
--
-- Resultado esperado: 0 linhas. Qualquer linha devolvida é um problema
-- de isolamento a corrigir (a forma mais provável de um data leak entre
-- organizações). Correr sempre que se cria uma tabela nova com org_id.
--
-- Equivale à parte META de rls_org_isolation.test.sql (que precisa de
-- Docker + `supabase test db`). Ver [[project-rls-org-isolation]].
-- ============================================================

with org_tables as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a
    on a.attrelid = c.oid and a.attname = 'org_id' and a.attnum > 0 and not a.attisdropped
  where c.relkind = 'r'
    -- exclusões legítimas (iguais à migration 20260520000006)
    and c.relname not in ('user_org_ativa', 'user_organizacoes', 'convites', 'profiles')
)
select t.relname as tabela, 'RLS desativada' as problema
from org_tables t
where t.relrowsecurity = false

union all

select t.relname, 'sem policy rls_org_isolation'
from org_tables t
where not exists (
  select 1 from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = t.relname
    and p.policyname = 'rls_org_isolation'
)

union all

select p.tablename, 'rls_org_isolation não é RESTRICTIVE'
from pg_policies p
where p.schemaname = 'public'
  and p.policyname = 'rls_org_isolation'
  and p.permissive <> 'RESTRICTIVE'

order by 1;
