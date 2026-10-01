-- Duas SECURITY DEFINER ficaram executáveis pelo anónimo.
--
-- O REVOKE ... FROM anon que as migrações traziam não chega: o EXECUTE não
-- vinha de um grant ao anon, vinha do default do PostgreSQL, que concede a
-- PUBLIC — e PUBLIC inclui o anon. É a mesma lição da migração
-- 20260828092547_revogar_public_security_definer_anon, aqui repetida para as
-- funções nascidas depois dela.
--
-- Apanhado pelo teste 30 de rls_anon_exposure ("nenhuma função SECURITY
-- DEFINER da aplicação é executável por anon fora da allowlist"), que falhava
-- com have: 2, want: 0.
--
-- prolongar_contrato_renting estica datas e cria cobranças; is_suporte_ti_decada
-- decide quem vê os pedidos de todas as organizações. Nenhuma delas tem razão
-- para ser alcançável sem sessão.

REVOKE ALL ON FUNCTION public.prolongar_contrato_renting(uuid, timestamptz, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_suporte_ti_decada() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.prolongar_contrato_renting(uuid, timestamptz, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_suporte_ti_decada() TO authenticated;
