-- Todos os preços do WeGest (tarifas, coberturas, extras, TVDE) já trazem IVA; a API
-- somava-o por cima (275 € saíam 338,25 €). O valor guardado passa a ser o com_iva e o
-- sem_iva decompõe-se; cada função é a sua última definição só com essa troca.

create or replace function public.api_preco_json_iva_incluido(p_valor numeric, p_iva numeric)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p_valor is null then null else jsonb_build_object(
    'sem_iva', round(p_valor / (1 + coalesce(p_iva, 0) / 100), 2),
    'com_iva', round(p_valor, 2),
    'iva', coalesce(p_iva, 0)) end;
$$;

-- Igual à 20261001120000, com api_preco_json_iva_incluido.
create or replace function public.api_coberturas(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'descricao', c.descricao,
    'preco_dia', public.api_preco_json_iva_incluido(c.preco_dia, public.api_iva_rent_a_car(p_org_id)),
    'franquia', public.api_preco_json_iva_incluido(c.franquia_valor, public.api_iva_rent_a_car(p_org_id))) order by c.nome), '[]'::jsonb)
  from public.renting_coberturas c where c.org_id = p_org_id and c.ativa;
$$;

-- Igual à 20261001120000, com api_preco_json_iva_incluido.
create or replace function public.api_extras(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'nome', e.nome, 'descricao', e.descricao,
    'preco', public.api_preco_json_iva_incluido(e.preco_unidade, public.api_iva_rent_a_car(p_org_id)),
    'tipo_calculo', e.tipo_calculo, 'quantidade_maxima', e.quantidade_maxima) order by e.nome), '[]'::jsonb)
  from public.renting_extras e where e.org_id = p_org_id and e.ativo;
$$;

-- Igual à 20261006140000, com api_preco_json_iva_incluido.
create or replace function public.api_modelos(p_org_id uuid, p_categoria uuid default null, p_tipo text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.modelo_id, 'marca', m.marca, 'modelo', m.modelo,
    'categoria', case when m.grupo_id is null then null else jsonb_build_object('id', m.grupo_id, 'nome', m.grupo_nome) end,
    'tipo', m.tipo, 'caixa', m.caixa, 'combustivel', m.combustivel, 'lugares', m.lugares,
    'portas', m.portas, 'bagageira', m.bagageira, 'ar_condicionado', m.ar_condicionado,
    'imagem_url', null::text,
    'foto_path', public.api_foto_modelo(p_org_id, m.modelo_id),
    'preco_dia', public.api_preco_json_iva_incluido(m.preco_dia, public.api_iva_rent_a_car(p_org_id)),
    'frota', m.frota)), '[]'::jsonb)
  from public.api_modelos_publicaveis(p_org_id) m
  where (p_categoria is null or m.grupo_id = p_categoria)
    and (p_tipo is null or m.tipo = p_tipo);
$$;

-- Igual à 20261001120000, com api_preco_json_iva_incluido.
create or replace function public.api_modelo(p_org_id uuid, p_modelo_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select (select x from jsonb_array_elements(public.api_modelos(p_org_id)) x where (x->>'id')::uuid = p_modelo_id)
      || jsonb_build_object(
    'tarifa', jsonb_build_object(
      'km_incluidos', p.km_mensal,
      'km_adicional', public.api_preco_json_iva_incluido(p.km_adicional_valor, public.api_iva_rent_a_car(p_org_id)),
      'franquia', public.api_preco_json_iva_incluido(p.franquia_valor, public.api_iva_rent_a_car(p_org_id)),
      'caucao', public.api_preco_json_iva_incluido(p.caucao_valor, public.api_iva_rent_a_car(p_org_id))),
    'coberturas', public.api_coberturas(p_org_id))
  from public.renting_tarifa_precos_modelo p
  where p.modelo_id = p_modelo_id and p.org_id = p_org_id
    and p.tarifa_id = public.api_tarifa_site(p_org_id)
    and exists (select 1 from public.api_modelos_publicaveis(p_org_id) x where x.modelo_id = p_modelo_id);
$$;

-- Igual à 20261001120000, com api_preco_json_iva_incluido.
create or replace function public.api_categorias(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'codigo', g.codigo, 'nome', g.nome, 'descricao', g.descricao,
    'codigo_sipp', g.codigo_sipp, 'imagem_url', g.imagem_url, 'combustivel', g.combustivel,
    'idade_minima_condutor', g.idade_minima_condutor, 'idade_maxima_condutor', g.idade_maxima_condutor,
    'preco_dia_desde', public.api_preco_json_iva_incluido(x.minimo, public.api_iva_rent_a_car(p_org_id)),
    'modelos', x.n) order by g.nome), '[]'::jsonb)
  from public.renting_grupos g
  join (select grupo_id, count(*)::int as n, min(preco_dia) as minimo
          from public.api_modelos_publicaveis(p_org_id) group by grupo_id) x on x.grupo_id = g.id
  where g.org_id = p_org_id and g.ativo;
$$;

-- Igual à 20261003100000, com api_preco_json_iva_incluido.
create or replace function public.api_disponibilidade(
  p_org_id uuid, p_inicio timestamptz, p_fim timestamptz, p_entrega uuid, p_recolha uuid,
  p_categoria uuid default null, p_tipo text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_erro jsonb := public.api_validar_periodo(p_org_id, p_inicio, p_fim, p_entrega, p_recolha);
  v_dias int; v_iva numeric; v_tarifa uuid;
begin
  if v_erro is not null then return v_erro; end if;
  v_dias := public.api_dias(p_inicio, p_fim);
  v_iva := public.api_iva_rent_a_car(p_org_id);
  v_tarifa := public.api_tarifa_site(p_org_id);
  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'dias', v_dias),
    'modelos', coalesce((
      with livres as (
        select l.modelo_id, count(*)::int as q
          from public.api_viaturas_livres(p_org_id, p_inicio, p_fim) l
         group by l.modelo_id
      ), saldo as (
        select l.modelo_id, l.q - coalesce(sv.n, 0) as q
          from livres l
          left join public.api_procura_sem_viatura(p_org_id, p_inicio, p_fim) sv
            on sv.modelo_id = l.modelo_id
      ), cartoes as (
        select x as cartao, (x->>'id')::uuid as modelo_id
          from jsonb_array_elements(public.api_modelos(p_org_id, p_categoria, p_tipo)) x
      )
      select jsonb_agg(c.cartao || jsonb_build_object(
               'quantidade_disponivel', s.q,
               'cotacao', jsonb_build_object(
                 'dias', v_dias,
                 'preco_dia', public.api_preco_json_iva_incluido(pr.preco_dia, v_iva),
                 'aluguer', public.api_preco_json_iva_incluido(pr.preco_dia * v_dias, v_iva),
                 'franquia', public.api_preco_json_iva_incluido(pr.franquia_valor, v_iva),
                 'caucao', public.api_preco_json_iva_incluido(pr.caucao_valor, v_iva),
                 'km_incluidos', pr.km_mensal))
             order by c.cartao->>'marca', c.cartao->>'modelo')
        from cartoes c
        join saldo s on s.modelo_id = c.modelo_id and s.q > 0
        join public.renting_tarifa_precos_modelo pr
          on pr.modelo_id = c.modelo_id and pr.tarifa_id = v_tarifa and pr.org_id = p_org_id
    ), '[]'::jsonb));
end $$;

-- Igual à 20261002110001, com api_preco_json_iva_incluido. subtotal.com_iva é a soma exacta
-- das linhas; o sem_iva decompõe-se do total e pode diferir 1 cêntimo da soma das linhas.
create or replace function public.api_cotacao(
  p_org_id uuid, p_modelo_id uuid, p_inicio timestamptz, p_fim timestamptz,
  p_entrega uuid, p_recolha uuid, p_extras jsonb, p_cobertura_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_erro jsonb := public.api_validar_periodo(p_org_id, p_inicio, p_fim, p_entrega, p_recolha);
  v_dias int; v_iva numeric; v_tarifa uuid; v_q int;
  v_m record; v_pr record; v_cob record; v_e record; v_item jsonb;
  v_linhas jsonb := '[]'::jsonb; v_total numeric := 0; v_valor numeric; v_vistos uuid[] := '{}';
  v_qtd numeric; v_cob_franquia numeric := null; v_tem_cobertura boolean := false;
begin
  if v_erro is not null then return v_erro; end if;
  if p_extras is not null and jsonb_typeof(p_extras) <> 'array' then
    return public.api_erro('PARAMETRO_INVALIDO', 'extras tem de ser uma lista.');
  end if;
  if jsonb_array_length(coalesce(p_extras, '[]'::jsonb)) > 20 then
    return public.api_erro('PARAMETRO_INVALIDO', 'Máximo de 20 extras.');
  end if;
  v_dias := public.api_dias(p_inicio, p_fim);
  v_iva := public.api_iva_rent_a_car(p_org_id);
  v_tarifa := public.api_tarifa_site(p_org_id);

  select * into v_m from public.api_modelos_publicaveis(p_org_id) where modelo_id = p_modelo_id;
  if not found then return public.api_erro('NAO_ENCONTRADO', 'Modelo não encontrado.'); end if;
  -- api_modelos_publicaveis só devolve modelos com preço na tarifa do site: a linha existe.
  select * into v_pr from public.renting_tarifa_precos_modelo
   where modelo_id = p_modelo_id and tarifa_id = v_tarifa and org_id = p_org_id;

  v_q := public.api_quantidade_disponivel(p_org_id, p_modelo_id, p_inicio, p_fim);
  if v_q < 1 then return public.api_erro('SEM_DISPONIBILIDADE', 'Sem viaturas deste modelo livres nestas datas.'); end if;

  v_valor := v_m.preco_dia * v_dias; v_total := v_total + v_valor;
  v_linhas := v_linhas || jsonb_build_object('tipo', 'aluguer', 'descricao', v_m.marca || ' ' || v_m.modelo || ' ou similar',
    'quantidade', v_dias, 'preco_unitario', public.api_preco_json_iva_incluido(v_m.preco_dia, v_iva), 'total', public.api_preco_json_iva_incluido(v_valor, v_iva));

  if p_cobertura_id is not null then
    select * into v_cob from public.renting_coberturas where id = p_cobertura_id and org_id = p_org_id and ativa;
    if not found then return public.api_erro('NAO_ENCONTRADO', 'Cobertura não encontrada.'); end if;
    v_tem_cobertura := true; v_cob_franquia := v_cob.franquia_valor;
    v_valor := v_cob.preco_dia * v_dias; v_total := v_total + v_valor;
    v_linhas := v_linhas || jsonb_build_object('tipo', 'cobertura', 'descricao', v_cob.nome,
      'quantidade', v_dias, 'preco_unitario', public.api_preco_json_iva_incluido(v_cob.preco_dia, v_iva), 'total', public.api_preco_json_iva_incluido(v_valor, v_iva));
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_extras, '[]'::jsonb)) loop
    -- Nenhum cast antes de o tipo estar confirmado: o OR não garante a ordem de avaliação.
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item->'extra_id') is distinct from 'string'
       or jsonb_typeof(v_item->'quantidade') is distinct from 'number' then
      return public.api_erro('PARAMETRO_INVALIDO', 'Cada extra precisa de extra_id e de uma quantidade inteira positiva.');
    end if;
    if (v_item->>'extra_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return public.api_erro('PARAMETRO_INVALIDO', 'Cada extra precisa de extra_id e de uma quantidade inteira positiva.');
    end if;
    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd <> trunc(v_qtd) or v_qtd < 1 then
      return public.api_erro('PARAMETRO_INVALIDO', 'Cada extra precisa de extra_id e de uma quantidade inteira positiva.');
    end if;
    if (v_item->>'extra_id')::uuid = any(v_vistos) then
      return public.api_erro('PARAMETRO_INVALIDO', 'O mesmo extra aparece mais de uma vez.');
    end if;
    v_vistos := v_vistos || (v_item->>'extra_id')::uuid;
    select * into v_e from public.renting_extras where id = (v_item->>'extra_id')::uuid and org_id = p_org_id and ativo;
    if not found then return public.api_erro('NAO_ENCONTRADO', 'Extra não encontrado.'); end if;
    -- Compara em numeric antes do cast: uma quantidade enorme nunca rebenta o int.
    if v_qtd > coalesce(v_e.quantidade_maxima, 99) then
      return public.api_erro('PARAMETRO_INVALIDO', 'Quantidade acima do máximo para ' || v_e.nome || '.');
    end if;
    v_valor := v_e.preco_unidade * v_qtd * (case when v_e.tipo_calculo = 'dia' then v_dias else 1 end);
    v_total := v_total + v_valor;
    v_linhas := v_linhas || jsonb_build_object('tipo', 'extra', 'descricao', v_e.nome,
      'quantidade', v_qtd::int, 'preco_unitario', public.api_preco_json_iva_incluido(v_e.preco_unidade, v_iva),
      'total', public.api_preco_json_iva_incluido(v_valor, v_iva));
  end loop;

  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'dias', v_dias),
    'modelo', jsonb_build_object('id', v_m.modelo_id, 'marca', v_m.marca, 'modelo', v_m.modelo),
    'linhas', v_linhas,
    'subtotal', public.api_preco_json_iva_incluido(v_total, v_iva),
    'franquia', public.api_preco_json_iva_incluido(case when v_tem_cobertura then v_cob_franquia else v_pr.franquia_valor end, v_iva),
    'caucao', public.api_preco_json_iva_incluido(v_pr.caucao_valor, v_iva),
    'km_incluidos', v_pr.km_mensal,
    'km_adicional', public.api_preco_json_iva_incluido(v_pr.km_adicional_valor, v_iva),
    'quantidade_disponivel', v_q);
end $$;

-- Igual à 20261006140000, com api_preco_json_iva_incluido.
create or replace function public.api_tvde_modelos(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.modelo_id, 'marca', m.marca, 'modelo', m.modelo,
    'categoria', case when m.grupo_id is null then null else jsonb_build_object('id', m.grupo_id, 'nome', m.grupo_nome) end,
    'caixa', m.caixa, 'combustivel', m.combustivel, 'lugares', m.lugares,
    'portas', m.portas, 'bagageira', m.bagageira, 'ar_condicionado', m.ar_condicionado,
    'imagem_url', null::text,
    'foto_path', public.api_foto_modelo(p_org_id, m.modelo_id),
    'preco_semana', public.api_preco_json_iva_incluido(m.preco_semana, i.iva),
    'caucao', public.api_preco_json_iva_incluido(m.caucao, i.iva),
    'franquia', public.api_preco_json_iva_incluido(m.franquia, i.iva),
    'km_incluidos', m.km_mensal,
    'km_adicional', public.api_preco_json_iva_incluido(m.km_adicional, i.iva),
    'frota', m.frota) order by m.marca, m.modelo), '[]'::jsonb)
  from public.api_tvde_modelos_publicaveis(p_org_id) m
  cross join (select public.api_iva_tvde(p_org_id) as iva) i;
$$;

-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated em cada função nova. Só a edge (service_role) executa.
do $$
declare f text;
begin
  foreach f in array array[
    'api_preco_json_iva_incluido(numeric, numeric)',
    'api_coberturas(uuid)', 'api_extras(uuid)', 'api_modelos(uuid, uuid, text)',
    'api_modelo(uuid, uuid)', 'api_categorias(uuid)',
    'api_disponibilidade(uuid, timestamptz, timestamptz, uuid, uuid, uuid, text)',
    'api_cotacao(uuid, uuid, timestamptz, timestamptz, uuid, uuid, jsonb, uuid)',
    'api_tvde_modelos(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
