-- Fecha o EXECUTE por anon/PUBLIC em tg_seed_alerta_cartao_frota_alterado().
--
-- A 20260922130000 revogou o EXECUTE nas funções do trigger de cartões e do
-- seed, mas esqueceu a função do trigger em `organizacoes` — SECURITY DEFINER
-- com o privilégio por omissão do PostgreSQL. Apanhado pelo gate
-- `rls_anon_exposure` (PR #306): «nenhuma função SECURITY DEFINER da aplicação
-- é executável por anon fora da allowlist» — have 1, want 0.
--
-- É função de trigger: o PostgreSQL só exige EXECUTE a quem CRIA o trigger,
-- não a quem dispara o INSERT, por isso fica sem EXECUTE para toda a gente e
-- continua a disparar. Mesmo padrão da 20260921140000.

REVOKE ALL ON FUNCTION public.tg_seed_alerta_cartao_frota_alterado() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
