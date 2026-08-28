-- Recuperada de supabase_migrations.schema_migrations (versão 20260729105822).
-- Foi aplicada em produção sem ficheiro correspondente no repositório, pelo que
-- um clone novo não recriava este estado.
--
-- Retira EXECUTE aos geradores de cobranças: são invocados pelos crons com o
-- service role, e não há razão para estarem ao alcance de um cliente.
REVOKE EXECUTE ON FUNCTION public.gerar_cobrancas_slot_mensais() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gerar_cobrancas_tvde_semanais(integer) FROM anon, authenticated;
