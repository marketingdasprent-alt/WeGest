-- API do site: no rent-a-car, caixa e lugares deixam de ser obrigatórios para publicar,
-- como já acontece no TVDE (20261006110000). Nenhum dos 55 modelos da "Rent a Car - Geral"
-- os tinha preenchidos, por isso o catálogo saía vazio. Passam a sair null até a equipa
-- os preencher; o OpenAPI acompanha. O preço/dia na tarifa do site continua obrigatório.

create or replace function public.api_modelos_publicaveis(p_org_id uuid)
returns table (modelo_id uuid, marca text, modelo text, grupo_id uuid, grupo_nome text, tipo text,
               caixa text, combustivel text, lugares smallint, portas smallint, bagageira smallint,
               ar_condicionado boolean, imagem_url text, preco_dia numeric, frota int)
language sql stable security definer set search_path = '' as $$
  with frota as (
    select v.modelo_id,
           count(*)::int as n,
           bool_or(upper(btrim(t.nome)) = 'COMERCIAL') as comercial,
           min(v.grupo_id::text)::uuid as grupo_id,
           min(coalesce(v.combustivel, '')) as combustivel
      from public.viaturas v
      left join public.viatura_tipos t on t.id = v.tipo_id
     where v.org_id = p_org_id
       and coalesce(v.is_vendida, false) = false
       and coalesce(v.is_slot, false) = false
       and v.modelo_id is not null
     group by v.modelo_id
  )
  select m.id, ma.nome, m.nome, g.id, g.nome,
         case when f.comercial then 'comercial' else 'passageiros' end,
         m.caixa, nullif(f.combustivel, ''), m.lugares, m.portas, m.bagageira, m.ar_condicionado,
         m.imagem_url, p.preco_dia, f.n
    from public.viatura_modelos m
    join public.viatura_marcas ma on ma.id = m.marca_id and ma.org_id = p_org_id
    join frota f on f.modelo_id = m.id
    left join public.renting_grupos g on g.id = f.grupo_id and g.org_id = p_org_id
    join public.renting_tarifa_precos_modelo p
      on p.modelo_id = m.id and p.org_id = p_org_id
     and p.tarifa_id = public.api_tarifa_site(p_org_id)
   where m.org_id = p_org_id
     and coalesce(m.ativo, true)
     and p.preco_dia is not null
   order by ma.nome, m.nome;
$$;

-- O create or replace mantém os grants, mas repete-se o fecho por segurança.
revoke execute on function public.api_modelos_publicaveis(uuid) from public, anon, authenticated;
grant execute on function public.api_modelos_publicaveis(uuid) to service_role;

notify pgrst, 'reload schema';
