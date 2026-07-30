-- Recuperada de supabase_migrations.schema_migrations (versão 20260729131901).
-- Foi aplicada em produção sem ficheiro correspondente no repositório.
--
-- Defesa em profundidade, seguindo o precedente de 20260728150000: neste
-- projeto o REVOKE FROM PUBLIC não retira EXECUTE ao anon, por isso revoga-se
-- explicitamente. Uma função de trigger não é invocável por RPC nem fora de
-- contexto de trigger, logo isto não corrige uma vulnerabilidade — mantém a
-- superfície consistente com o resto do esquema.
revoke execute on function public.fn_notificacoes_agrupar() from anon, authenticated;
