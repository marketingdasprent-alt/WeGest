-- ============================================================
-- Superfície anónima e escalada de privilégios (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Este ficheiro cobre quatro incidentes, todos de 2026-07-29/30, e é
-- estrutural de propósito: as asserções 15-18, 29 e 30 falham para QUALQUER
-- tabela ou função nova que repita o padrão, não só para as do incidente.
--
-- 1. LEITURA ANÓNIMA (29-07). 3631 linhas — incluindo 750 399,64 € de receitas
--    de motoristas — legíveis com a chave `anon`, que é pública por desenho.
--    Fechado em 20260729160000.
--
-- 2. A TORNEIRA (30-07). A causa de 1 não eram as 8 políticas: era o
--    `ALTER DEFAULT PRIVILEGES` de public, que concede `arwdDxtm` a `anon` em
--    toda a tabela nova. 172 das 174 tabelas tinham SELECT para anon sem
--    ninguém o ter decidido. Fechado em 20260730084227, com as regressões
--    20260730084755 e 20260730085024.
--
-- 3. ESCALADA DE PRIVILÉGIOS (30-07). `Users can update their own profile` não
--    restringia colunas; um PATCH ao próprio cargo_id propagava-se por
--    trg_mirror_profile_role -> user_organizacoes -> trg_uorg_sync_is_admin ->
--    is_admin = true. Fechado em 20260730083944.
--
-- 4. FUNÇÕES E CÓDIGO DE ORG (30-07). 445 das 483 funções de public eram
--    executáveis por `anon`, 76 delas SECURITY DEFINER invocáveis por RPC — e
--    SECURITY DEFINER ignora a RLS por completo. E o código de organização,
--    que autoriza o registo de motorista, vinha listado em
--    `GET /organizacoes?select=codigo`. Fechados em 20260730090840 e
--    20260730091152.
--
-- Se algo precisar genuinamente de acesso anónimo, acrescenta-o à allowlist
-- COM justificação. Nunca por conveniência.
-- ============================================================

begin;
select plan(34);

-- ------------------------------------------------------------
-- As allowlists, num sítio só
-- ------------------------------------------------------------
-- TABELAS. `organizacoes` saiu em 20260730091152: passou a ser servida pelas
-- RPC org_por_codigo/org_codigo_disponivel, para os códigos deixarem de ser
-- enumeráveis.
--   leads_dasprent  → INSERT dos formulários públicos, restrito à org DASPRENT
--                     por anon_leads_insert; o org_id vem do default da coluna.
--   login_attempts  → INSERT do registo de tentativas, que corre com a sessão
--                     ainda anónima quando o login falha.
create temporary table _tabelas_anon(tabela text) on commit drop;
insert into _tabelas_anon values ('leads_dasprent'), ('login_attempts');

-- FUNÇÕES executáveis por anon. As três primeiras são chamadas pelo frontend
-- sem sessão; as duas seguintes são invocadas DENTRO de políticas e defaults
-- (as expressões de política correm com os privilégios de quem chama) e
-- devolvem NULL/false ao anónimo; as duas últimas substituem a leitura da
-- tabela organizacoes.
create temporary table _funcoes_anon(funcao text) on commit drop;
insert into _funcoes_anon values
  ('formulario_publico_por_id'), ('validar_convite_token'), ('marcar_convite_usado'),
  ('get_current_org_id'), ('is_current_user_admin'),
  ('org_por_codigo'), ('org_codigo_disponivel');

-- ------------------------------------------------------------
-- 1. Nenhuma PERMISSIVE USING(true) alcançável por anon
-- ------------------------------------------------------------
select is(
  (
    with tabelas_alcancaveis as (
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
    join tabelas_alcancaveis t on t.relname = p.tablename
    where p.schemaname = 'public'
      and p.permissive = 'PERMISSIVE'
      and (p.roles::text like '%public%' or p.roles::text like '%anon%')
      and p.cmd in ('SELECT', 'ALL')
      and btrim(coalesce(p.qual, '')) in ('true', '(true)')
      and p.tablename not in (select tabela from _tabelas_anon)
  ),
  0,
  'nenhuma política PERMISSIVE USING(true) alcançável por anon fora da allowlist'
);

-- ------------------------------------------------------------
-- 2-8. As 7 políticas do incidente 1 não voltaram
-- ------------------------------------------------------------
select ok(not exists (select 1 from pg_policies where schemaname='public'
    and tablename='uber_transactions' and policyname='Financeiro pode ver transações Uber'),
  'uber_transactions: política anónima removida (expunha 1878 linhas / 750k EUR)');
select ok(not exists (select 1 from pg_policies where schemaname='public'
    and tablename='assistencia_anexos' and policyname='Acesso Total Anexos'),
  'assistencia_anexos: política anónima removida (expunha 1568 linhas)');
select ok(not exists (select 1 from pg_policies where schemaname='public'
    and tablename='assistencia_tickets' and policyname='Acesso Total Assistencia'),
  'assistencia_tickets: política anónima removida (expunha 118 linhas)');
select ok(not exists (select 1 from pg_policies where schemaname='public'
    and tablename='cargos' and policyname='Todos podem ver cargos'),
  'cargos: política anónima removida (expunha as 5 orgs, não só a própria)');
select ok(not exists (select 1 from pg_policies where schemaname='public'
    and tablename='document_templates' and policyname='Todos podem ver templates ativos'),
  'document_templates: política anónima removida (expunha 28 templates)');
select ok(not exists (select 1 from pg_policies where schemaname='public'
    and tablename='bolt_viagens' and policyname='Financeiro pode ver todas as viagens Bolt'),
  'bolt_viagens: política anónima removida');
select ok(not exists (select 1 from pg_policies where schemaname='public'
    and tablename='uber_atividade_motoristas' and policyname='Service role pode inserir atividade'),
  'uber_atividade_motoristas: política anónima FOR ALL removida (permitia escrita)');

-- ------------------------------------------------------------
-- 9. A cobertura de authenticated tem de continuar a existir
-- ------------------------------------------------------------
-- Contraprova das remoções acima: se estas desaparecerem, o acesso legítimo
-- parte em silêncio.
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
-- 10-14. organizacoes: fechada ao anónimo, incluindo o código
-- ------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.organizacoes', 'SELECT'),
  'anon não tem SELECT na tabela organizacoes');
select ok(not has_column_privilege('anon', 'public.organizacoes', 'nif', 'SELECT'),
  'anon não pode ler organizacoes.nif');
select ok(not has_column_privilege('anon', 'public.organizacoes', 'morada', 'SELECT'),
  'anon não pode ler organizacoes.morada');
select ok(not has_column_privilege('anon', 'public.organizacoes', 'telefone', 'SELECT'),
  'anon não pode ler organizacoes.telefone');
-- Esta é a que mudou de sentido em 20260730091152. Antes o anon PRECISAVA de
-- ler `codigo` para o login funcionar, o que tornava os códigos das 5
-- organizações enumeráveis — e o código é o que autoriza o registo de
-- motorista numa org. Agora resolve-se por RPC (asserções 31-32).
select ok(not has_column_privilege('anon', 'public.organizacoes', 'codigo', 'SELECT'),
  'anon não pode ler organizacoes.codigo — os códigos deixaram de ser enumeráveis');

-- ------------------------------------------------------------
-- 15. A TORNEIRA (tabelas): default privileges sem anon
-- ------------------------------------------------------------
-- Limitado ao concedente `postgres` de propósito: postgres não é membro de
-- supabase_admin, logo o default ACL desse segundo concedente não é alterável.
-- As migrações correm como postgres, e a asserção 18 apanha o que escapar.
select is(
  (select count(*)::int
   from pg_default_acl d
   join pg_namespace n on n.oid = d.defaclnamespace and n.nspname = 'public'
   where pg_get_userbyid(d.defaclrole) = 'postgres'
     and d.defaclobjtype in ('r', 'S')
     and d.defaclacl::text like '%anon=%'),
  0,
  'default privileges de public (concedente postgres) não concedem tabelas nem sequences a anon'
);

-- ------------------------------------------------------------
-- 16-17. Nenhum grant de tabela a anon fora da allowlist
-- ------------------------------------------------------------
select is(
  (select count(*)::int
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where c.relkind in ('r','p','v','m')
     and c.relname not in (select tabela from _tabelas_anon)
     and exists (
       select 1 from pg_attribute a
       where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         and has_column_privilege('anon', c.oid, a.attnum, 'SELECT')
     )),
  0,
  'anon não tem SELECT (nem por coluna) em nenhuma relação fora da allowlist'
);

select is(
  (select count(*)::int
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   cross join lateral (values ('INSERT'),('UPDATE'),('DELETE')) as pr(priv)
   where c.relkind in ('r','p')
     and c.relname not in (select tabela from _tabelas_anon)
     and has_table_privilege('anon', c.oid, pr.priv)),
  0,
  'anon não tem INSERT/UPDATE/DELETE em nenhuma tabela fora da allowlist'
);

-- ------------------------------------------------------------
-- 18. A REDE: rls_deny_anon em toda a tabela fora da allowlist
-- ------------------------------------------------------------
-- Negar com USING(false) em vez de depender de `org_id = get_current_org_id()`
-- dar NULL para o anónimo: se essa função passar a devolver uma org por
-- omissão, a negação implícita desaparece sem aviso.
select is(
  (select count(*)::int
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where c.relkind in ('r','p')
     and c.relname not in (select tabela from _tabelas_anon)
     and not exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = c.relname
         and p.policyname = 'rls_deny_anon'
     )),
  0,
  'toda a tabela de public fora da allowlist tem a política rls_deny_anon'
);

-- ------------------------------------------------------------
-- 19-22. Formulário público: tabelas fechadas, RPC estreita aberta
-- ------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.formularios', 'SELECT'),
  'anon não lê formularios directamente (era enumerável entre organizações)');
select ok(not has_table_privilege('anon', 'public.formulario_campanhas', 'SELECT'),
  'anon não lê formulario_campanhas directamente');
select ok(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='formulario_publico_por_id'),
  'formulario_publico_por_id é SECURITY DEFINER (é o que substitui as duas leituras)'
);
select ok(
  has_function_privilege('anon', 'public.formulario_publico_por_id(uuid)', 'EXECUTE'),
  'anon executa formulario_publico_por_id — /formulario/:id continua a funcionar'
);

-- ------------------------------------------------------------
-- 23-24. Escrita de leads: sem injecção entre organizações
-- ------------------------------------------------------------
select ok(
  not exists (select 1 from pg_policies where schemaname='public'
    and tablename='leads_dasprent' and policyname='Qualquer um pode criar leads'),
  'leads_dasprent: removida a política with check (true) que permitia injecção cross-org'
);
-- Esta lia `profiles` inline, e ler profiles aciona mt_profiles_select, que
-- referencia user_organizacoes — também inline. Como as expressões de política
-- correm com os privilégios de quem chama, o insert anónimo rebentava com
-- 42501 depois de revogados os grants.
select ok(
  not exists (select 1 from pg_policies where schemaname='public'
    and tablename='leads_dasprent' and policyname='Admins can manage leads'),
  'leads_dasprent: removida a política que lia profiles inline e partia o insert anónimo'
);

-- ------------------------------------------------------------
-- 25-28. Escalada de privilégios
-- ------------------------------------------------------------
select ok(
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname = 'profiles'
      and t.tgname = 'trg_profiles_bloqueia_auto_escalada'
      and not t.tgisinternal
  ),
  'profiles: trigger que impede um não-admin de alterar o seu próprio cargo/is_admin'
);
select ok(
  exists (select 1 from pg_policies where schemaname='public'
    and tablename='user_org_ativa' and policyname='rls_org_ativa_tem_de_pertencer_ao_user'
    and permissive='RESTRICTIVE'),
  'user_org_ativa: a org activa tem de ser uma org do próprio utilizador'
);
select ok(
  (select pg_get_expr(d.adbin, d.adrelid)
     from pg_attrdef d
     join pg_class c on c.oid = d.adrelid
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
    where c.relname = 'leads_dasprent' and a.attname = 'org_id')
  like '%11111111-1111-1111-1111-111111111111%',
  'leads_dasprent.org_id cai na org DASPRENT sem sessão (os formulários não enviam org_id)'
);
select ok(
  strpos(
    (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='handle_new_user_org'),
    '''%admin%'''
  ) > 0,
  'handle_new_user_org recusa um cargo administrativo vindo da metadata do signUp'
);

-- ------------------------------------------------------------
-- 29. A TORNEIRA (funções)
-- ------------------------------------------------------------
-- Duas vias, ambas fechadas: o default ACL do Supabase concede a `anon`, e o
-- default do próprio PostgreSQL concede EXECUTE a `PUBLIC` (que inclui anon).
-- Revogar só de anon não bastava — verificado por ensaio.
select is(
  (select count(*)::int
   from pg_default_acl d
   join pg_namespace n on n.oid = d.defaclnamespace and n.nspname = 'public'
   where pg_get_userbyid(d.defaclrole) = 'postgres'
     and d.defaclobjtype = 'f'
     and (d.defaclacl::text like '%anon=%' or array_to_string(d.defaclacl, ',') ~ '(^|,)=X/')),
  0,
  'default privileges de funções (concedente postgres) não concedem EXECUTE a anon nem a PUBLIC'
);

-- ------------------------------------------------------------
-- 30. A asserção central: nenhuma SECURITY DEFINER aberta ao anónimo
-- ------------------------------------------------------------
-- SECURITY DEFINER corre como o dono e ignora a RLS por completo — nenhuma
-- política a trava, por isso esta é a superfície que mais importa fechar.
--
-- Restrito às funções da APLICAÇÃO (dono `postgres`). As de extensões
-- (btree_gist, pg_trgm, unaccent — 223 funções, dono `supabase_admin`)
-- continuam executáveis por anon: computam sobre os argumentos, não tocam em
-- dados, não são SECURITY DEFINER, e o postgres não pode revogar grants feitos
-- pelo supabase_admin.
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.prokind = 'f'
     and p.prosecdef
     and pg_get_userbyid(p.proowner) = 'postgres'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in (select funcao from _funcoes_anon)),
  0,
  'nenhuma função SECURITY DEFINER da aplicação é executável por anon fora da allowlist'
);

-- ------------------------------------------------------------
-- 31-32. As RPC que substituem a leitura de organizacoes
-- ------------------------------------------------------------
select ok(
  has_function_privilege('anon', 'public.org_por_codigo(text)', 'EXECUTE'),
  'anon executa org_por_codigo — o registo de motorista por código continua a funcionar'
);
select ok(
  has_function_privilege('anon', 'public.org_codigo_disponivel(text)', 'EXECUTE'),
  'anon executa org_codigo_disponivel — /registar-org valida o código sem ler a tabela'
);

-- ------------------------------------------------------------
-- 33-34. organizacoes: sem leitura cruzada entre organizações
-- ------------------------------------------------------------
-- O mesmo padrão do incidente de 29-07, uma última vez: as duas políticas
-- org-scoped já existiam, mas `Permitir verificar codigo de org publicamente`
-- estava por cima com USING(true) e, como as PERMISSIVE se somam com OR,
-- tornava-as decorativas. Demonstrado antes de corrigir: um não-admin da Década
-- Ousada lia o NIF, morada, telefone e código das outras 4 organizações.
select ok(
  not exists (select 1 from pg_policies where schemaname='public'
    and tablename='organizacoes'
    and policyname='Permitir verificar codigo de org publicamente'),
  'organizacoes: removida a política USING(true) que anulava o isolamento entre orgs'
);
-- Contraprova: sem estas, o selector de organizações e a vista do fornecedor
-- partem em silêncio.
select is(
  (select count(*)::int from pg_policies
   where schemaname='public' and tablename='organizacoes' and permissive='PERMISSIVE'
     and policyname in ('Users podem ver orgs a que pertencem',
                        'Decada Ousada admins podem gerir organizacoes')),
  2,
  'organizacoes: as políticas org-scoped que substituem a leitura aberta continuam presentes'
);

select finish();
rollback;
