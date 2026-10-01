-- ============================================================================
-- Fecha o EXECUTE por `anon`/PUBLIC em nove funções SECURITY DEFINER da
-- aplicação que ficaram com o privilégio por omissão do PostgreSQL.
-- ============================================================================
--
-- Apanhado pelo gate `rls_anon_exposure` (teste 30): "nenhuma função SECURITY
-- DEFINER da aplicação é executável por anon fora da allowlist" — have 9,
-- want 0. SECURITY DEFINER corre como o dono e ignora a RLS; é a superfície
-- que mais importa fechar, mesmo quando a função em si não faz nada de útil
-- a um anónimo.
--
-- Seis são funções de trigger: o PostgreSQL só exige EXECUTE a quem CRIA o
-- trigger, não a quem dispara o DML — por isso podem ficar sem EXECUTE para
-- toda a gente, o trigger continua a disparar. Duas são auxiliares chamadas
-- só de dentro de outras RPCs SECURITY DEFINER (correm como o dono). Uma é
-- RPC chamada pelo backoffice: fica só para `authenticated`.
--
-- Idempotente. Ver também 20260917100000, 20260918100001, 20260918120001,
-- 20260921110000 e 20260921130000, onde estas funções nascem.
-- ============================================================================

-- Funções de trigger — ninguém as chama directamente.
REVOKE ALL ON FUNCTION public.ao_enviar_documento_motorista()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ao_registar_km_motorista()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ao_submeter_recibo_verde()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aplicar_leitura_km()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_debito_dano()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_pagamento_resumo()      FROM PUBLIC, anon, authenticated;

-- Auxiliares chamadas só de dentro de aprovar/rejeitar_documento_motorista
-- (SECURITY DEFINER: correm como o dono, que tem sempre EXECUTE).
REVOKE ALL ON FUNCTION public.pode_rever_documentos_motorista()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fechar_aviso_documentos_pendentes(uuid)        FROM PUBLIC, anon, authenticated;

-- RPC do backoffice (aprovar candidatura → associar/criar ficha pelo NIF).
REVOKE ALL ON FUNCTION public.aprovar_candidatura_motorista(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_candidatura_motorista(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
