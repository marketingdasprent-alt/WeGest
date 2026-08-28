-- Recuperada de supabase_migrations.schema_migrations (versão 20260729110025).
-- Foi aplicada em produção sem ficheiro correspondente no repositório.
--
-- Seguimento de 20260729105822: revogar de anon/authenticated não bastava,
-- porque o EXECUTE também vinha por PUBLIC. Neste projeto um REVOKE FROM PUBLIC
-- não retira o privilégio já concedido explicitamente a anon, por isso revogam-se
-- os três.
REVOKE EXECUTE ON FUNCTION public.gerar_cobrancas_slot_mensais() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gerar_cobrancas_tvde_semanais(integer) FROM PUBLIC, anon, authenticated;
