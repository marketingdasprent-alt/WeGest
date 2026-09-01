-- ============================================================================
-- automacao_regra_teste_cooldown: a política de negação tinha o nome errado
-- ============================================================================
--
-- rls_anon_exposure.test.sql (teste 18) exige que TODA a tabela de public,
-- fora da allowlist, tenha uma política chamada literalmente `rls_deny_anon`
-- — é essa convenção exacta que o teste procura, não só uma negação
-- funcional. A migração anterior (20260904090000) criou `rls_deny_all`, que
-- nega tudo mas não bate certo com o nome que o teste exige.
-- ============================================================================

alter policy rls_deny_all on public.automacao_regra_teste_cooldown
  rename to rls_deny_anon;
