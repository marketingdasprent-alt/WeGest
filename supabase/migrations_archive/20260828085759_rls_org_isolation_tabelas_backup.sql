-- As tabelas `_backup_viaturas_*` ficaram de fora de 20260828084250 com o
-- argumento "não se protege lixo, apaga-se". O teste rls_org_isolation não
-- concorda, e tem razão: enquanto existirem, são cópias de dados de viaturas
-- COM org_id e sem isolamento — leitura entre organizações na mesma, só que
-- de dados antigos.
--
-- Protegê-las é o passo seguro; apagá-las continua a ser o passo certo, e fica
-- assinalado como tal (ver docs/motor-automacao/reconstrucao-migracoes.md).
do $$
declare r record; criadas int := 0;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r'
      and c.relname like '\_backup\_%'
      and exists (
        select 1 from information_schema.columns col
        where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'org_id'
      )
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'rls_org_isolation'
      )
    order by c.relname
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format(
      'create policy rls_org_isolation on public.%I '
      'as restrictive for all to authenticated '
      'using (org_id = public.get_current_org_id()) '
      'with check (org_id = public.get_current_org_id())',
      r.relname
    );
    criadas := criadas + 1;
    raise notice 'rls_org_isolation criada em %', r.relname;
  end loop;
  raise notice 'total: %', criadas;
end $$;
