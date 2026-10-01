-- `repsol_duplicados_removidos_20260921` — tabela de backup criada em produção
-- a 21-09, antes de limpar 600 transacções Repsol duplicadas de Setembro/2026
-- (26.296,90 EUR).
--
-- Porquê duplicadas: a chave de identidade de uma abastecida mudou a meio do
-- mês. As importações de 08-09 e 15-09 gravaram com o hash da linha inteira; a
-- de 21-09 já usou `transactionKey` (cartão+instante+valor+litros, ver
-- _shared/repsol/chave.ts). O upsert casa por `transaction_id`, chaves de
-- formatos diferentes não colidem, e a reimportação inseriu tudo de novo em vez
-- de actualizar. Cada linha guardada aqui tem par exacto em repsol_transacoes.
--
-- NOTA: não se apagou "tudo o que tem chave antiga". Das 2110 linhas nesse
-- formato, 1510 são de Julho e Agosto e são o ÚNICO registo desses meses — só
-- saíram as 600 que tinham cópia nova.
--
-- Mesmo regime das outras: isolada por organização e fechada ao anónimo, senão
-- os gates rls_org_isolation e rls_anon_exposure do CI falham. Quando deixar de
-- fazer falta, o certo é um DROP — como para a gémea de 17-09.
--
-- Guardada por `to_regclass`: em bases construídas só a partir das migrações
-- (dev local, CI sem baseline) a tabela não existe, e a migração tem de passar
-- à mesma.

do $$
begin
  if to_regclass('public.repsol_duplicados_removidos_20260921') is null then
    return;
  end if;

  execute 'alter table public.repsol_duplicados_removidos_20260921 enable row level security';

  -- Ninguém a lê pela API: nenhum ficheiro do repositório lhe toca.
  execute 'revoke all on public.repsol_duplicados_removidos_20260921 from anon, authenticated';

  execute 'drop policy if exists rls_deny_anon on public.repsol_duplicados_removidos_20260921';
  execute 'create policy rls_deny_anon on public.repsol_duplicados_removidos_20260921
             as restrictive for all to anon using (false)';

  execute 'drop policy if exists rls_org_isolation on public.repsol_duplicados_removidos_20260921';
  execute 'create policy rls_org_isolation on public.repsol_duplicados_removidos_20260921
             as restrictive for all to public
             using (org_id = get_current_org_id())
             with check (org_id = get_current_org_id())';
end $$;

NOTIFY pgrst, 'reload schema';
