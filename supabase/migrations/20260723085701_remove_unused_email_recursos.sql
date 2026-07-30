-- Recuperada de supabase_migrations.schema_migrations (versão 20260723085701).
-- Foi aplicada em produção sem ficheiro correspondente no repositório.
--
-- Módulo Email nunca chegou a ter frontend (sem rota, sem página, sem
-- componente de inbox). As únicas atribuições existentes em cargo_permissoes
-- eram do cargo "Administrador" (seed automático, sem efeito real: admins já
-- ignoram cargo_permissoes via is_admin). Remover até a funcionalidade
-- existir de facto — cascade apaga as 10 linhas de cargo_permissoes.
DELETE FROM public.recursos WHERE nome IN ('email_ver', 'email_gerir');
