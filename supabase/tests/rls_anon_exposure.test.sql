-- ============================================================
-- Exposição anónima — política PERMISSIVE incondicional (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Incidente de origem (2026-07-29): 3631 linhas — incluindo 750 399,64 € de
-- receitas de motoristas em uber_transactions — eram legíveis por qualquer
-- pessoa na internet com a chave `anon`, que é pública por desenho.
-- Corrigido em 20260729160000_fechar_fuga_dados_anonima.sql.
--
-- CAUSA RAIZ, e é o que este teste protege: as 139 políticas RESTRICTIVE
-- `rls_org_isolation` que fazem o isolamento multi-tenant estão declaradas
-- `TO authenticated`. O papel `anon` nunca é cruzado com
-- `org_id = get_current_org_id()`. Logo uma política PERMISSIVE `USING (true)`
-- criada sem `TO` (o default é PUBLIC, que inclui anon) não expõe "esta tabela
-- publicamente" — expõe **todas as organizações a quem não fez login**.
--
-- Este teste é estrutural de propósito: falha para QUALQUER tabela nova que
-- repita o padrão, não só para as 8 do incidente. Complementa
-- rls_org_isolation.test.sql (que cobre tabelas com org_id sem isolamento) e
-- rls_org_audit.sql (a mesma verificação em versão read-only para produção).
--
-- Se uma tabela precisar genuinamente de leitura anónima, acrescenta-a à
-- allowlist abaixo COM justificação. Nunca por conveniência.
-- ============================================================

begin;
select plan(14);

-- ------------------------------------------------------------
-- 1. O invariante da classe
-- ------------------------------------------------------------
-- Allowlist — leitura anónima que é funcionalidade real:
--   formulario_campanhas → /formulario/:id (FormularioPublico.tsx) precisa de
--                          resolver a campanha antes de haver sessão.
--   organizacoes         → login por código de org, registo de org e registo de
--                          motorista (/motorista/registo). Protegida por grant
--                          de COLUNA (id, nome, codigo, ativa), não da tabela
--                          inteira — ver asserções 10–14.
select is(
  (
    with tabelas_anon as (
      select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relkind = 'r'
        and exists (
          select 1 from pg_attribute a
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            and has_column_privilege('anon', c.oid, a.attnum, 'SELECT')
        )
    )
    select count(*)::int
    from pg_policies p
    join tabelas_anon t on t.relname = p.tablename
    where p.schemaname = 'public'
      and p.permissive = 'PERMISSIVE'
      and (p.roles::text like '%public%' or p.roles::text like '%anon%')
      and p.cmd in ('SELECT', 'ALL')
      and btrim(coalesce(p.qual, '')) in ('true', '(true)')
      and p.tablename <> all (array['formulario_campanhas', 'organizacoes'])
  ),
  0,
  'nenhuma política PERMISSIVE USING(true) alcançável por anon fora da allowlist'
);

-- ------------------------------------------------------------
-- 2–8. As 7 políticas do incidente não voltaram
-- ------------------------------------------------------------
select ok(
  not exists (select 1 from pg_policies where schemaname='public'
    and tablename='uber_transactions' and policyname='Financeiro pode ver transações Uber'),
  'uber_transactions: política anónima removida (expunha 1878 linhas / 750k EUR)'
);
select ok(
  not exists (select 1 from pg_policies where schemaname='public'
    and tablename='assistencia_anexos' and policyname='Acesso Total Anexos'),
  'assistencia_anexos: política anónima removida (expunha 1568 linhas)'
);
select ok(
  not exists (select 1 from pg_policies where schemaname='public'
    and tablename='assistencia_tickets' and policyname='Acesso Total Assistencia'),
  'assistencia_tickets: política anónima removida (expunha 118 linhas)'
);
select ok(
  not exists (select 1 from pg_policies where schemaname='public'
    and tablename='cargos' and policyname='Todos podem ver cargos'),
  'cargos: política anónima removida (expunha as 5 orgs, não só a própria)'
);
select ok(
  not exists (select 1 from pg_policies where schemaname='public'
    and tablename='document_templates' and policyname='Todos podem ver templates ativos'),
  'document_templates: política anónima removida (expunha 28 templates)'
);
select ok(
  not exists (select 1 from pg_policies where schemaname='public'
    and tablename='bolt_viagens' and policyname='Financeiro pode ver todas as viagens Bolt'),
  'bolt_viagens: política anónima removida'
);
select ok(
  not exists (select 1 from pg_policies where schemaname='public'
    and tablename='uber_atividade_motoristas' and policyname='Service role pode inserir atividade'),
  'uber_atividade_motoristas: política anónima FOR ALL removida (permitia escrita)'
);

-- ------------------------------------------------------------
-- 9. A cobertura de authenticated tem de continuar a existir
-- ------------------------------------------------------------
-- Contraprova da remoção acima: se estas políticas desaparecerem, o acesso
-- legítimo parte em silêncio. Foi por isto que empresas_select foi SUBSTITUÍDA
-- e não apenas removida (a alternativa, empresas_admin, depende de user_roles,
-- tabela legada com 4 linhas).
select is(
  (select count(*)::int from pg_policies
   where schemaname='public' and permissive='PERMISSIVE'
     and (tablename, policyname) in (
       ('uber_transactions','mt_uber_transactions_all'),
       ('assistencia_anexos','mt_assist_anexos_select'),
       ('assistencia_tickets','mt_assist_tickets_select'),
       ('cargos','mt_cargos_select'),
       ('document_templates','mt_templates_select'),
       ('bolt_viagens','mt_bolt_viagens_select'),
       ('uber_atividade_motoristas','mt_uber_atividade_all'),
       ('empresas','empresas_select')
     )),
  8,
  'as 8 políticas org-scoped que substituem o acesso anónimo continuam presentes'
);

-- ------------------------------------------------------------
-- 10–14. organizacoes: PII fechado, login por código preservado
-- ------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.organizacoes', 'SELECT'),
  'anon não tem SELECT na tabela organizacoes inteira (só nas colunas do login)');
select ok(not has_column_privilege('anon', 'public.organizacoes', 'nif', 'SELECT'),
  'anon não pode ler organizacoes.nif');
select ok(not has_column_privilege('anon', 'public.organizacoes', 'morada', 'SELECT'),
  'anon não pode ler organizacoes.morada');
select ok(not has_column_privilege('anon', 'public.organizacoes', 'telefone', 'SELECT'),
  'anon não pode ler organizacoes.telefone');
select ok(
  has_column_privilege('anon', 'public.organizacoes', 'id', 'SELECT')
  and has_column_privilege('anon', 'public.organizacoes', 'nome', 'SELECT')
  and has_column_privilege('anon', 'public.organizacoes', 'codigo', 'SELECT')
  and has_column_privilege('anon', 'public.organizacoes', 'ativa', 'SELECT'),
  'anon mantém id/nome/codigo/ativa — login por código de org continua a funcionar'
);

select finish();
rollback;
