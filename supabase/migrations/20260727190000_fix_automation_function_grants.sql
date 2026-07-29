-- Motor de Automação — correção de segurança: 4 funções ficaram
-- chamáveis via RPC por anon/authenticated por omissão do Postgres
-- (EXECUTE concedido a PUBLIC em toda função nova, salvo REVOKE
-- explícito) — as outras funções internas do motor já tinham REVOKE,
-- estas quatro foram esquecidas.
--
-- seed_automacao_defaults(uuid) é o caso grave: sem nenhuma verificação
-- de permissão interna, um utilizador (mesmo anon) podia chamá-la
-- diretamente com um org_id arbitrário e inserir 4 automation_rules
-- nessa organização. As outras três (funções de trigger, mais
-- retry_failed_job) não eram exploráveis na prática, mas fecham-se
-- também por defesa em profundidade.
-- Encontrado via get_advisors(type='security') logo após aplicar as
-- migrations de hoje.

revoke all on function public.seed_automacao_defaults(uuid) from public, anon, authenticated, service_role;
revoke all on function public.trg_organizacoes_seed_automacao() from public, anon, authenticated, service_role;
revoke all on function public.fn_contrato_cobrancas_domain_event() from public, anon, authenticated, service_role;

-- retry_failed_job deve continuar chamável por authenticated (é o único
-- ponto de entrada do dashboard admin) — só se remove o anon/public.
revoke all on function public.retry_failed_job(uuid) from public, anon;
grant execute on function public.retry_failed_job(uuid) to authenticated;
