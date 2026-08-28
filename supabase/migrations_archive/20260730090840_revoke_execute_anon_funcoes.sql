-- ============================================================
-- A terceira porta: EXECUTE anónimo em 483 funções de `public`
-- ============================================================
-- As migrações de 30-07 fecharam a leitura anónima (grants + rls_deny_anon) e
-- a escalada de privilégios. Ficou esta, que é independente das duas: uma
-- função `SECURITY DEFINER` corre como o seu dono e **ignora a RLS por
-- completo**, portanto nenhuma política a trava.
--
-- MEDIDO EM PRODUÇÃO (2026-07-30), schema public:
--   483 funções no total
--   445 concediam EXECUTE a `anon` explicitamente
--   431 concediam EXECUTE a `PUBLIC` (que inclui anon)
--   138 dessas eram SECURITY DEFINER, das quais 76 INVOCÁVEIS por RPC
--       (as outras 62 devolvem `trigger`, e o PostgREST não as expõe)
--
-- Entre as invocáveis estavam `merge_motoristas`,
-- `aprovar_candidatura_motorista`, `get_email_api_key`, `set_email_api_key`,
-- `manage_cron_job`, `listar_colaboradores` e `gerar_contrato_atomico`.
--
-- Revogar só de `anon` NÃO bastava: 431 funções concediam a `PUBLIC`, e
-- `REVOKE ... FROM anon` não remove um grant dado a PUBLIC. Verificado por
-- ensaio: com apenas o revoke de anon, `get_current_org_id()` continuava
-- acessível. Daí o segundo revoke.
--
-- PORQUE É SEGURO PARA OS AUTENTICADOS
-- 455 das 483 concedem EXECUTE a `authenticated` explicitamente. Só UMA
-- concedia a PUBLIC sem conceder a authenticated — `fn_notificacoes_agrupar`,
-- que é função de trigger. E as funções de trigger não precisam de EXECUTE do
-- chamador: o Postgres verifica esse privilégio quando o trigger é criado, não
-- quando dispara. Confirmado por ensaio — com EXECUTE revogado de tudo, o
-- insert anónimo em `login_attempts` (que dispara
-- fn_login_attempts_rate_limit) e em `leads_dasprent` (que dispara o webhook
-- `Lead Distância`) continuaram a passar.
--
-- ENSAIO ANTES DE APLICAR (transação revertida): os 4 fluxos anónimos
-- passaram, `listar_colaboradores` e `set_email_api_key` ficaram vedadas ao
-- anónimo, e `listar_colaboradores` e a leitura de `viaturas` continuaram a
-- funcionar para um autenticado.
--
-- Reversão:  grant execute on all functions in schema public to anon;
--            alter default privileges in schema public grant execute on functions to anon;
-- ============================================================

-- ------------------------------------------------------------
-- A torneira, para funções
-- ------------------------------------------------------------
-- Sem isto, cada função nova nasce executável pelo anónimo, exactamente como
-- acontecia com as tabelas. O `from public` cobre o default do próprio
-- PostgreSQL (que concede EXECUTE a PUBLIC em toda a função nova); o
-- `from anon` cobre o default ACL do Supabase.
--
-- Os autenticados continuam cobertos: o default ACL concede-lhes EXECUTE
-- explicitamente, e este revoke não lhes toca.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;

-- ------------------------------------------------------------
-- A allowlist anónima — 5 funções, cada uma com um fluxo verificado
-- ------------------------------------------------------------
-- Levantada por grep a `.rpc(` em todos os ficheiros alcançáveis sem sessão
-- (rotas públicas em src/routes/WebAppRoutes.tsx:109-131) mais as funções que
-- as políticas e os defaults das 3 tabelas da allowlist invocam.

-- /formulario/:id — substitui a leitura directa de formularios e
-- formulario_campanhas (src/pages/FormularioPublico.tsx).
grant execute on function public.formulario_publico_por_id(uuid) to anon;

-- /register — valida o token do convite antes de haver sessão
-- (src/pages/Register.tsx). Devolve só a linha do token pedido.
grant execute on function public.validar_convite_token(text) to anon;
grant execute on function public.marcar_convite_usado(text) to anon;

-- Invocadas DENTRO de políticas e de defaults de coluna, não pelo frontend.
-- As expressões de política correm com os privilégios de quem chama, por isso
-- o anónimo precisa de EXECUTE mesmo sem nunca as chamar directamente:
--   get_current_org_id()     → default de leads_dasprent.org_id
--   is_current_user_admin()  → política `Admins podem gerenciar todos os
--                              leads` (ALL, TO public), avaliada no insert
--                              anónimo de leads
-- Ambas devolvem NULL/false para o anónimo: não revelam nada.
grant execute on function public.get_current_org_id() to anon;
grant execute on function public.is_current_user_admin() to anon;
