-- `repsol_duplicados_removidos_20260917` — tabela de backup criada à mão em
-- produção a 17-09, antes de limpar transacções Repsol duplicadas. Tem org_id
-- e 354 linhas, e nasceu sem política nenhuma: os dois gates de segurança do
-- CI (rls_org_isolation e rls_anon_exposure) falham por causa dela.
--
-- Fecha-se em vez de se apagar: são dados de uma limpeza recente e quem a criou
-- pode ainda precisar deles para conferir. Enquanto existir, fica com o mesmo
-- regime de qualquer outra tabela — isolada por organização e fechada ao
-- anónimo. Quando deixar de fazer falta, o certo é um DROP.
--
-- Guardada por `to_regclass`: em bases construídas só a partir das migrações
-- (dev local, CI sem baseline) a tabela não existe, e a migração tem de passar
-- à mesma.

do $$
begin
  if to_regclass('public.repsol_duplicados_removidos_20260917') is null then
    return;
  end if;

  execute 'alter table public.repsol_duplicados_removidos_20260917 enable row level security';

  -- Ninguém a lê pela API: nenhum ficheiro do repositório lhe toca. O SELECT
  -- que tinha concedido a `authenticated` era só o default de um CREATE TABLE
  -- AS feito à pressa.
  execute 'revoke all on public.repsol_duplicados_removidos_20260917 from anon, authenticated';

  execute 'drop policy if exists rls_deny_anon on public.repsol_duplicados_removidos_20260917';
  execute 'create policy rls_deny_anon on public.repsol_duplicados_removidos_20260917
             as restrictive for all to anon using (false)';

  execute 'drop policy if exists rls_org_isolation on public.repsol_duplicados_removidos_20260917';
  execute 'create policy rls_org_isolation on public.repsol_duplicados_removidos_20260917
             as restrictive for all to public
             using (org_id = get_current_org_id())
             with check (org_id = get_current_org_id())';
end $$;

NOTIFY pgrst, 'reload schema';
