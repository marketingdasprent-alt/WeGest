-- ============================================================
-- Catálogo da API externa de rent-a-car (leitura, por organização)
-- ============================================================
-- A edge function api-rent-a-car chama estas funções com service_role e o
-- org_id da chave. Nunca get_current_org_id(): não há sessão de utilizador.
--
-- Ordem das definições: cada função só usa as que vêm antes
-- (api_modelo usa api_coberturas e api_modelos; api_categorias usa
-- api_modelos_publicaveis).
-- ============================================================

create or replace function public.api_preco_json(p_valor numeric, p_iva numeric)
returns jsonb language sql immutable as $$
  select case when p_valor is null then null else jsonb_build_object(
    'sem_iva', round(p_valor, 2),
    'com_iva', round(p_valor * (1 + coalesce(p_iva, 0) / 100), 2),
    'iva', coalesce(p_iva, 0)) end;
$$;

create or replace function public.api_iva_rent_a_car(p_org_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select iva_rent_a_car from public.org_definicoes where org_id = p_org_id), 23);
$$;

create or replace function public.api_tarifa_site(p_org_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.renting_tarifas
   where org_id = p_org_id and ativa and tarifa_site limit 1;
$$;

-- Modelo publicável: caixa e lugares preenchidos, preço/dia na tarifa do site
-- e pelo menos uma viatura não-slot não vendida. Tipo: COMERCIAL → comercial,
-- tudo o resto (PASSAGEIROS, TVDE, sem tipo) → passageiros.
create or replace function public.api_modelos_publicaveis(p_org_id uuid)
returns table (modelo_id uuid, marca text, modelo text, grupo_id uuid, grupo_nome text, tipo text,
               caixa text, combustivel text, lugares smallint, portas smallint, bagageira smallint,
               ar_condicionado boolean, imagem_url text, preco_dia numeric, frota int)
language sql stable security definer set search_path = public as $$
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
    join public.viatura_marcas ma on ma.id = m.marca_id
    join frota f on f.modelo_id = m.id
    left join public.renting_grupos g on g.id = f.grupo_id
    join public.renting_tarifa_precos_modelo p
      on p.modelo_id = m.id and p.tarifa_id = public.api_tarifa_site(p_org_id)
   where m.org_id = p_org_id
     and coalesce(m.ativo, true)
     and m.caixa is not null and m.lugares is not null
     and p.preco_dia is not null
   order by ma.nome, m.nome;
$$;

create or replace function public.api_localizacoes(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'nome', e.nome, 'morada', e.morada, 'cidade', e.cidade,
    'horario', e.horario, 'latitude', e.latitude, 'longitude', e.longitude) order by e.nome), '[]'::jsonb)
  from public.estacoes e where e.org_id = p_org_id and e.ativa;
$$;

create or replace function public.api_coberturas(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'descricao', c.descricao,
    'preco_dia', public.api_preco_json(c.preco_dia, public.api_iva_rent_a_car(p_org_id)),
    'franquia', public.api_preco_json(c.franquia_valor, public.api_iva_rent_a_car(p_org_id))) order by c.nome), '[]'::jsonb)
  from public.renting_coberturas c where c.org_id = p_org_id and c.ativa;
$$;

create or replace function public.api_extras(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'nome', e.nome, 'descricao', e.descricao,
    'preco', public.api_preco_json(e.preco_unidade, public.api_iva_rent_a_car(p_org_id)),
    'tipo_calculo', e.tipo_calculo, 'quantidade_maxima', e.quantidade_maxima) order by e.nome), '[]'::jsonb)
  from public.renting_extras e where e.org_id = p_org_id and e.ativo;
$$;

create or replace function public.api_modelos(p_org_id uuid, p_categoria uuid default null, p_tipo text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.modelo_id, 'marca', m.marca, 'modelo', m.modelo,
    'categoria', case when m.grupo_id is null then null else jsonb_build_object('id', m.grupo_id, 'nome', m.grupo_nome) end,
    'tipo', m.tipo, 'caixa', m.caixa, 'combustivel', m.combustivel, 'lugares', m.lugares,
    'portas', m.portas, 'bagageira', m.bagageira, 'ar_condicionado', m.ar_condicionado,
    'imagem_url', m.imagem_url,
    'preco_dia', public.api_preco_json(m.preco_dia, public.api_iva_rent_a_car(p_org_id)),
    'frota', m.frota)), '[]'::jsonb)
  from public.api_modelos_publicaveis(p_org_id) m
  where (p_categoria is null or m.grupo_id = p_categoria)
    and (p_tipo is null or m.tipo = p_tipo);
$$;

create or replace function public.api_modelo(p_org_id uuid, p_modelo_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select (select x from jsonb_array_elements(public.api_modelos(p_org_id)) x where (x->>'id')::uuid = p_modelo_id)
      || jsonb_build_object(
    'tarifa', jsonb_build_object(
      'km_incluidos', p.km_mensal,
      'km_adicional', public.api_preco_json(p.km_adicional_valor, public.api_iva_rent_a_car(p_org_id)),
      'franquia', public.api_preco_json(p.franquia_valor, public.api_iva_rent_a_car(p_org_id)),
      'caucao', public.api_preco_json(p.caucao_valor, public.api_iva_rent_a_car(p_org_id))),
    'coberturas', public.api_coberturas(p_org_id))
  from public.renting_tarifa_precos_modelo p
  where p.modelo_id = p_modelo_id and p.tarifa_id = public.api_tarifa_site(p_org_id)
    and exists (select 1 from public.api_modelos_publicaveis(p_org_id) x where x.modelo_id = p_modelo_id);
$$;

create or replace function public.api_categorias(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'codigo', g.codigo, 'nome', g.nome, 'descricao', g.descricao,
    'codigo_sipp', g.codigo_sipp, 'imagem_url', g.imagem_url, 'combustivel', g.combustivel,
    'idade_minima_condutor', g.idade_minima_condutor, 'idade_maxima_condutor', g.idade_maxima_condutor,
    'preco_dia_desde', public.api_preco_json(x.minimo, public.api_iva_rent_a_car(p_org_id)),
    'modelos', x.n) order by g.nome), '[]'::jsonb)
  from public.renting_grupos g
  join (select grupo_id, count(*)::int as n, min(preco_dia) as minimo
          from public.api_modelos_publicaveis(p_org_id) group by grupo_id) x on x.grupo_id = g.id
  where g.org_id = p_org_id and g.ativo;
$$;

-- Só o service_role (a edge function) executa. Nomear PUBLIC, anon e
-- authenticated: os default privileges dão EXECUTE a authenticated em cada
-- função nova. api_preco_json entra na lista por ser api_*; as funções
-- SECURITY DEFINER acima chamam-na como dono, por isso não precisa de mais.
do $$
declare f text;
begin
  foreach f in array array[
    'api_preco_json(numeric, numeric)',
    'api_iva_rent_a_car(uuid)', 'api_tarifa_site(uuid)', 'api_modelos_publicaveis(uuid)',
    'api_localizacoes(uuid)', 'api_coberturas(uuid)', 'api_extras(uuid)',
    'api_modelos(uuid, uuid, text)', 'api_modelo(uuid, uuid)', 'api_categorias(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
