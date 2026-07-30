-- Recuperada de supabase_migrations.schema_migrations (versão 20260728133707).
-- Foi aplicada em produção sem ficheiro correspondente no repositório.
--
-- Substitui o entity_id do evento de login suspeito: em vez de um agregado que
-- não correspondia a nenhuma linha real, passa a apontar para a tentativa
-- falhada mais recente daquele email na janela de 15 minutos.
create or replace function public.emit_login_suspeitos_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    o.id,
    'seguranca.login_suspeito',
    'login_attempts',
    (
      select la2.id from public.login_attempts la2
      where la2.email = la.email and la2.success = false
        and la2.created_at >= now() - interval '15 minutes'
      order by la2.created_at desc
      limit 1
    ),
    jsonb_build_object('email', la.email, 'tentativas', count(*), 'janela_minutos', 15),
    'cron'
  from public.login_attempts la
  join public.organizacoes o on lower(o.codigo) = lower(la.org_codigo)
  where la.success = false
    and la.created_at >= now() - interval '15 minutes'
  group by la.email, o.id
  having
    count(*) >= 5
    and not exists (
      select 1 from public.domain_events e
      where e.event_type = 'seguranca.login_suspeito'
        and e.payload->>'email' = la.email
        and e.created_at >= now() - interval '15 minutes'
    );
end;
$$;

revoke all on function public.emit_login_suspeitos_events() from public, anon, authenticated;
grant execute on function public.emit_login_suspeitos_events() to service_role;
