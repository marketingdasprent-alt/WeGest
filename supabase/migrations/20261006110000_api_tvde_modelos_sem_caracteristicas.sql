-- API do site, D1: no TVDE, caixa e lugares deixam de ser obrigatórios para publicar.
-- Nenhum dos 30 modelos com preço semanal os tinha preenchidos, por isso o catálogo
-- saía vazio. Passam a sair como null até a equipa os preencher; o OpenAPI acompanha.
-- O preço semanal continua obrigatório. O rent-a-car (api_modelos_publicaveis) não muda.

create or replace function public.api_tvde_modelos_publicaveis(p_org_id uuid)
returns table (modelo_id uuid, marca text, modelo text, grupo_id uuid, grupo_nome text,
               caixa text, combustivel text, lugares smallint, portas smallint, bagageira smallint,
               ar_condicionado boolean, imagem_url text, preco_semana numeric, caucao numeric,
               franquia numeric, km_mensal int, km_adicional numeric, frota int)
language sql stable security definer set search_path = '' as $$
  with frota as (
    select e.modelo_id,
           count(*)::int as n,
           min(v.grupo_id::text)::uuid as grupo_id,
           min(coalesce(v.combustivel, '')) as combustivel
      from public.api_tvde_viaturas_elegiveis(p_org_id) e
      join public.viaturas v on v.id = e.viatura_id and v.org_id = p_org_id
     group by e.modelo_id
  )
  select m.id, ma.nome, m.nome, g.id, g.nome,
         m.caixa, nullif(f.combustivel, ''), m.lugares, m.portas, m.bagageira, m.ar_condicionado,
         m.imagem_url, p.preco_semana, p.caucao_valor, p.franquia_valor, p.km_mensal,
         p.km_adicional_valor, f.n
    from public.viatura_modelos m
    join public.viatura_marcas ma on ma.id = m.marca_id and ma.org_id = p_org_id
    join frota f on f.modelo_id = m.id
    left join public.renting_grupos g on g.id = f.grupo_id and g.org_id = p_org_id
    join public.renting_tarifa_precos_modelo p
      on p.modelo_id = m.id and p.org_id = p_org_id
     and p.tarifa_id = public.api_tarifa_site_tvde(p_org_id)
   where m.org_id = p_org_id
     and coalesce(m.ativo, true)
     and p.preco_semana is not null
   order by ma.nome, m.nome;
$$;

-- O create or replace mantém os grants, mas repete-se o fecho por segurança.
revoke execute on function public.api_tvde_modelos_publicaveis(uuid) from public, anon, authenticated;
grant execute on function public.api_tvde_modelos_publicaveis(uuid) to service_role;

notify pgrst, 'reload schema';
