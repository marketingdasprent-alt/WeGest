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

-- ============================================================
-- PARTE 2 — tabelas SEM org_id nenhum (ponto cego da Parte 1)
-- ============================================================
-- A Parte 1 só vê tabelas que TÊM org_id. Tabelas de dados de tenant
-- criadas SEM org_id (muitas vezes pela UI do Supabase) escapam: foi assim
-- que formularios, lead_status_history e motorista_custos_adicionais
-- vazaram entre orgs (2026-06-19). Esta query lista todas as tabelas base
-- sem org_id que NÃO estão na allowlist de globais legítimas — cada linha é
-- um candidato a rever (é tenant data? então precisa de org_id + isolamento).
--
-- Ao classificar uma tabela nova como global, acrescenta-a à allowlist.
-- ============================================================
select c.relname as tabela, 'SEM org_id — rever se é dado de tenant' as problema
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'r'
  and not exists (
    select 1 from pg_attribute a
    where a.attrelid = c.oid and a.attname = 'org_id'
      and a.attnum > 0 and not a.attisdropped
  )
  and c.relname <> all (array[
    -- Globais legítimas (partilhadas por todas as orgs por design):
    'organizacoes',         -- a própria tabela de orgs
    'recursos',             -- catálogo global de permissões
    'campos_catalogo',      -- catálogo global de placeholders
    'user_roles',           -- roles a nível de user
    'user_org_ativa',       -- sessão (user → org ativa)
    'user_organizacoes',    -- junção user ↔ org
    'convites',             -- convites (pré-org)
    'notificacao_dispensas' -- dispensas por user
  ])
order by 1;
