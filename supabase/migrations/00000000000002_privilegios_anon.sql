-- ============================================================================
-- PRIVILÉGIOS DO PAPEL `anon` — arranque de uma base de dados nova
-- ============================================================================
--
-- Corre a seguir a `00000000000001_dados_catalogo.sql`.
--
-- ── PORQUE ISTO EXISTE ──────────────────────────────────────────────────────
--
-- `pg_dump --schema public` escreve os GRANTs que EXISTEM. Não escreve a
-- ausência deles: não emite `REVOKE`, e não emite `ALTER DEFAULT PRIVILEGES`,
-- que é informação ao nível da base de dados e não do schema.
--
-- Consequência, medida a 2026-08-28 na primeira reconstrução real:
--
--                                     produção   base reconstruída
--   relações com SELECT para anon            0                 194
--   tabelas com escrita para anon            2                 564
--   funções SECURITY DEFINER para anon      24                 208
--
-- Produção está fechada porque a migração `20260730084227` a fechou. Essa
-- migração fica ARQUIVADA no cutover para baseline, portanto nunca corre num
-- rebuild — e a base nova nasce com o papel anónimo a poder tudo, por causa
-- dos default privileges do stack local do Supabase.
--
-- Este ficheiro repõe a camada 1 dessa migração. Sem ele, qualquer ambiente
-- reconstruído a partir deste repositório é um ambiente aberto.
--
-- ── O QUE `anon` PODE, E PORQUÊ ─────────────────────────────────────────────
--
-- A lista é curta de propósito e cada linha corresponde a um fluxo sem sessão
-- verificado em src/routes/WebAppRoutes.tsx. Acrescentar aqui exige nomear o
-- fluxo e uma entrada correspondente em supabase/tests/rls_anon_exposure.test.sql.
-- ============================================================================

-- ── Fechar a torneira ───────────────────────────────────────────────────────
-- Os default privileges são a causa raiz: sem isto, cada tabela NOVA volta a
-- nascer com grants para `anon`, e o problema regressa sozinho.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- ── Reabrir o mínimo: tabelas ───────────────────────────────────────────────

-- Formulário de leads da landing e do formulário público. Só INSERT — o
-- anónimo nunca teve política de SELECT nesta tabela.
grant insert on public.leads_dasprent to anon;

-- Registo de tentativas de login, para o rate limit em Login.tsx.
grant insert on public.login_attempts to anon;

-- `organizacoes` NÃO leva grant nenhum, nem por coluna. O login por código
-- passou a usar a RPC `org_por_codigo`, precisamente para os códigos deixarem
-- de ser enumeráveis — ver o comentário em src/lib/org-codigo.ts.

-- ── Reabrir o mínimo: funções ───────────────────────────────────────────────

-- Login e registo por código de organização.
grant execute on function public.org_por_codigo(text)        to anon;
grant execute on function public.org_codigo_disponivel(text) to anon;

-- Formulário público em /formulario/:id, sem sessão.
grant execute on function public.formulario_publico_por_id(uuid) to anon;

-- Aceitação de convite: quem aceita ainda não tem organização nem sessão.
grant execute on function public.validar_convite_token(text) to anon;
grant execute on function public.marcar_convite_usado(text)  to anon;

-- `authenticated` e `service_role` não são tocados por este ficheiro: o
-- `revoke` acima é só para `anon`, e os grants deles vêm do baseline.

-- ── Fechar o caminho por `PUBLIC` nas funções SECURITY DEFINER ─────────────
--
-- `revoke ... from anon` acima NÃO chega, e é a armadilha clássica: quando se
-- cria uma função, o Postgres concede `EXECUTE` a `PUBLIC` por omissão, e
-- `anon` herda de `PUBLIC`. Revogar a `anon` não corta a herança — o
-- privilégio continua a chegar pelo outro caminho.
--
-- Medido: depois do `revoke ... from anon`, ainda havia 17 funções
-- SECURITY DEFINER da aplicação executáveis pelo anónimo. Todas por `PUBLIC`.
--
-- SECURITY DEFINER corre como o dono e ignora a RLS por completo: nenhuma
-- política a trava. É a superfície que mais importa fechar.
--
-- Só revoga. NÃO reconcede a `authenticated`/`service_role`: os grants
-- explícitos desses vêm do baseline (o pg_dump escreve-os), e reconceder em
-- bloco abriria funções que são deliberadamente só para o service_role — como
-- `process_domain_events` ou `automation_runs_claim`.
--
-- Restrito ao dono `postgres` (funções da aplicação). As das extensões
-- pertencem a `supabase_admin`, não são SECURITY DEFINER, computam sobre os
-- argumentos sem tocar em dados, e o `postgres` não pode revogar grants feitos
-- por outro dono.
do $$
declare
  r record;
  allowlist text[] := array[
    'formulario_publico_por_id',
    'validar_convite_token',
    'marcar_convite_usado',
    'get_current_org_id',
    'is_current_user_admin',
    'org_por_codigo',
    'org_codigo_disponivel'
  ];
  fechadas int := 0;
begin
  for r in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.prokind = 'f'
      and p.prosecdef
      and pg_get_userbyid(p.proowner) = 'postgres'
      and p.proname <> all (allowlist)
    order by 1
  loop
    execute format('revoke all on function %s from public, anon', r.assinatura);
    fechadas := fechadas + 1;
  end loop;
  raise notice 'EXECUTE revogado a public/anon em % funções SECURITY DEFINER', fechadas;
end $$;

-- ── Extensões instaladas em `public` ────────────────────────────────────────
-- pg_trgm, unaccent e btree_gist vivem em `public` neste projecto, e o
-- `revoke all on all functions` acima também lhes tirou o EXECUTE a `anon`.
-- É o desejado: nenhum fluxo anónimo faz pesquisa por semelhança. Se algum dia
-- fizer, reconceder explicitamente aqui, com o fluxo nomeado.

-- ── PORQUE REVOGAR AQUI NÃO PARTE NADA ──────────────────────────────────────
--
-- Verificado em produção a 2026-08-28, função a função: as 17 têm todas uma
-- ACL desta forma —
--
--   =X/postgres  postgres=X/postgres  authenticated=X/postgres  service_role=X/postgres
--
-- O `=X/postgres` (concessionário vazio) é o grant a PUBLIC, e é por aí que o
-- anónimo entra. Os outros dois são grants EXPLÍCITOS, que o `revoke ... from
-- public, anon` não toca e que o baseline já traz (o pg_dump escreve a ACL
-- inteira). Depois deste bloco, `authenticated` e `service_role` continuam a
-- poder chamá-las exactamente como antes.
--
-- Era o risco a confirmar antes de escrever isto: se o EXECUTE só chegasse por
-- PUBLIC, revogar PUBLIC tirava-o também a quem tem sessão, e partia o portal
-- do motorista (`motorista_extrato_periodo`, `motorista_meus_acordos_ativos`).
-- Não é o caso.
--
-- Das 17, oito são funções de trigger (`fn_*`, `tg_*`, `set_ti_ticket_numero`,
-- `marcar_refecho_por_atribuicao`): revogar-lhes o EXECUTE não afecta o
-- disparo do trigger, que não passa por verificação de privilégio. As outras
-- nove são chamáveis, e seis delas escrevem ou lêem dados de negócio sem que
-- exista fluxo anónimo que as justifique.
