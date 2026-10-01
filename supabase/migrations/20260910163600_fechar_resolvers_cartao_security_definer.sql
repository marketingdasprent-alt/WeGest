-- Os resolvers recebem org_id por parâmetro e usam SECURITY DEFINER. Não são
-- RPCs de produto: só existem para o trigger de imputação de transações.
-- Executá-los diretamente como authenticated permitia escolher outra org.

alter function public.tg_resolver_motorista_cartao() security definer;
alter function public.tg_resolver_motorista_cartao() set search_path = '';

revoke all on function public.tg_resolver_motorista_cartao() from public, anon, authenticated;
grant execute on function public.tg_resolver_motorista_cartao() to service_role;

revoke all on function public.resolver_titular_por_cartao(uuid, text, text, date)
  from public, anon, authenticated;
grant execute on function public.resolver_titular_por_cartao(uuid, text, text, date)
  to service_role;

revoke all on function public.resolver_devedor_do_cliente(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.resolver_devedor_do_cliente(uuid, uuid, date)
  to service_role;

revoke all on function public.resolver_motorista_por_cartao(uuid, text, text, date)
  from public, anon, authenticated;
grant execute on function public.resolver_motorista_por_cartao(uuid, text, text, date)
  to service_role;

notify pgrst, 'reload schema';
