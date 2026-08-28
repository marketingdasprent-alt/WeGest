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

-- ── Extensões instaladas em `public` ────────────────────────────────────────
-- pg_trgm, unaccent e btree_gist vivem em `public` neste projecto, e o
-- `revoke all on all functions` acima também lhes tirou o EXECUTE a `anon`.
-- É o desejado: nenhum fluxo anónimo faz pesquisa por semelhança. Se algum dia
-- fizer, reconceder explicitamente aqui, com o fluxo nomeado.

-- ── NOTA SOBRE A DIVERGÊNCIA COM PRODUÇÃO ───────────────────────────────────
--
-- Produção tem, a 2026-08-28, SEIS funções SECURITY DEFINER executáveis por
-- `anon` que não constam da lista acima:
--
--   cobranca_ceder_a_motorista(uuid, uuid)
--   cobranca_reverter_cessao_motorista(uuid)
--   criar_versao_contrato_renting(uuid, text, timestamptz)
--   motorista_extrato_periodo(uuid, date, date)
--   recalcular_movimentos_do_cartao(uuid)
--   seed_automacao_danos_assistencia(uuid)
--
-- Nenhuma serve um fluxo anónimo. Este ficheiro NÃO as concede, portanto uma
-- base reconstruída fica mais fechada do que produção — deliberadamente: o
-- ficheiro descreve a postura pretendida, e a diferença é a medida da deriva.
--
-- Revogá-las em produção é uma alteração de comportamento a uma base viva e
-- precisa de decisão explícita. Está registada em
-- docs/motor-automacao/reconstrucao-migracoes.md como achado por resolver.
