-- Fecha o caminho por PUBLIC nas funções SECURITY DEFINER da aplicação.
--
-- Encontrado a 2026-08-28 pelo pgTAP rls_anon_exposure: 17 funções
-- SECURITY DEFINER com dono `postgres` executáveis pelo papel anónimo. Correm
-- como o dono e ignoram RLS por completo — nenhuma política as trava.
--
-- A causa é o comportamento por omissão do Postgres: `create function` concede
-- EXECUTE a PUBLIC, e `anon` herda daí. A migração 20260730084227 revogou os
-- grants de TABELAS a anon, mas não este caminho nas funções. É a armadilha
-- clássica: `revoke ... from anon` não corta o que chega por PUBLIC.
--
-- ÂMBITO: só as funções que HOJE têm PUBLIC. Cirúrgico de propósito — as
-- outras ~191 já tinham PUBLIC revogado e não são tocadas.
--
-- VERIFICADO ANTES DE APLICAR, função a função:
--   · nenhuma das 208 tem proacl nula (nenhuma depende só do default);
--   · as 17 alvo têm todas `authenticated=X` e `service_role=X` EXPLÍCITOS,
--     que este revoke não toca — quem tem sessão continua a poder chamá-las;
--   · 8 das 17 são funções de trigger: revogar-lhes o EXECUTE não afecta o
--     disparo do trigger, que não passa por verificação de privilégio.
--
-- VERIFICADO DEPOIS: 0 funções expostas ao anon; authenticated e service_role
-- mantêm acesso às 9 chamáveis; a allowlist de 5 continua intacta.
--
-- Fora do âmbito, de propósito: a allowlist de 7 funções que servem fluxos sem
-- sessão reais (login/registo por código de org, formulário público, aceitação
-- de convite). Espelha supabase/tests/rls_anon_exposure.test.sql.
do $$
declare
  r record;
  allowlist text[] := array[
    'formulario_publico_por_id',
    'validar_convite_token',
    'marcar_convite_usado',
    'get_current_org_id',
    'is_current_user_admin',
    'org_por_codigo',
    'org_codigo_disponivel'
  ];
  fechadas int := 0;
begin
  for r in
    select p.oid::regprocedure as assinatura, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.prokind = 'f'
      and p.prosecdef
      and pg_get_userbyid(p.proowner) = 'postgres'
      and p.proname <> all (allowlist)
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by 1
  loop
    execute format('revoke all on function %s from public, anon', r.assinatura);
    fechadas := fechadas + 1;
    raise notice 'PUBLIC revogado: %', r.proname;
  end loop;
  raise notice 'total fechadas: %', fechadas;
end $$;
