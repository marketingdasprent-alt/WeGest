-- Recuperada de supabase_migrations.schema_migrations (versão 20260729105842).
-- Foi aplicada em produção sem ficheiro correspondente no repositório.
--
-- A tabela cron_http_log nasceu com o GRANT que o Supabase dá por omissão ao
-- anon. O RLS já bloqueava a leitura (verificado: 0 linhas), mas o grant não
-- tinha razão de existir — foi apanhado pela própria verificação de exposição
-- anónima acrescentada nesse dia.
revoke all on public.cron_http_log from anon;
