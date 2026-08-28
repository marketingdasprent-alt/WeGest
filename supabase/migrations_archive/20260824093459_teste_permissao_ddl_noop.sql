-- ⚠️ RECUPERADA de supabase_migrations.schema_migrations (2026-08-28).
-- Aplicada a produção a 2026-08-24 sem ficheiro no repositório. O SQL abaixo é
-- o que ficou registado na coluna `statements` — é o original, não uma
-- reconstrução.
--
-- O nome sugere um teste de permissões DDL, mas o efeito é real: cria
-- `org_sistema()`, de que `vigiar_cron_edge()` depende para carimbar o org_id
-- dos alertas de cron. Não é um no-op.
create or replace function public.org_sistema()
returns uuid
language sql
immutable
as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
