-- ============================================================
-- API rent-a-car, fase B: disponibilidade e cotação
-- ============================================================
-- A edge function api-rent-a-car chama estas funções com service_role e o
-- org_id da chave. Erros de negócio voltam como { erro: { codigo, mensagem } }
-- dentro do jsonb; a edge traduz o código para HTTP.
-- Disponibilidade e preço saem sempre daqui, nunca do site.
-- ============================================================

create or replace function public.api_erro(p_codigo text, p_mensagem text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('erro', jsonb_build_object('codigo', p_codigo, 'mensagem', p_mensagem));
$$;

-- Dias no calendário de Lisboa: uma mudança de hora não acrescenta um dia.
create or replace function public.api_dias(p_inicio timestamptz, p_fim timestamptz)
returns int language sql immutable set search_path = '' as $$
  select greatest(1, ceil(extract(epoch from
    ((p_fim at time zone 'Europe/Lisbon') - (p_inicio at time zone 'Europe/Lisbon'))) / 86400.0))::int;
$$;

-- null se o período é válido; senão o erro de negócio.
create or replace function public.api_validar_periodo(
  p_org_id uuid, p_inicio timestamptz, p_fim timestamptz, p_entrega uuid, p_recolha uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tarifa uuid := public.api_tarifa_site(p_org_id);
  v_de date; v_ate date;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    return public.api_erro('PERIODO_INVALIDO', 'O fim tem de ser depois do início.');
  end if;
  if p_inicio <= now() then
    return public.api_erro('PERIODO_INVALIDO', 'O início tem de ser no futuro.');
  end if;
  if public.api_dias(p_inicio, p_fim) > 30 then
    return public.api_erro('PERIODO_EXCEDE_MAXIMO', 'Máximo de 30 dias. Para mais, consulte o aluguer de longa duração.');
  end if;
  if not exists (select 1 from public.estacoes where id = p_entrega and org_id = p_org_id and ativa)
     or not exists (select 1 from public.estacoes where id = p_recolha and org_id = p_org_id and ativa) then
    return public.api_erro('NAO_ENCONTRADO', 'Localização de entrega ou recolha inexistente.');
  end if;
  if v_tarifa is null then
    return public.api_erro('CONFIG_EM_FALTA', 'Tarifário do site por configurar.');
  end if;
  select valido_de, valido_ate into v_de, v_ate
    from public.renting_tarifas where id = v_tarifa and org_id = p_org_id;
  if (v_de is not null and (p_inicio at time zone 'Europe/Lisbon')::date < v_de)
     or (v_ate is not null and (p_inicio at time zone 'Europe/Lisbon')::date > v_ate) then
    return public.api_erro('TARIFA_INDISPONIVEL', 'Ainda não há preços para estas datas.');
  end if;
  return null;
end $$;

-- Viaturas que o site pode vender no período. viaturas_com_disponibilidade
-- (partilhada com o ecrã) só vê contratos, reservas, movimentos e reparações;
-- aqui tiram-se também as viaturas paradas, vendidas até ao início e as que
-- têm motorista TVDE no período ('ativo' com data_fim futura é válido, como
-- em src/utils/associacaoViatura.ts). 'reservada'/'em_uso' são o estado de
-- hoje: o período futuro já vem dos contratos e reservas.
create or replace function public.api_viaturas_livres(
  p_org_id uuid, p_inicio timestamptz, p_fim timestamptz)
returns table (viatura_id uuid, modelo_id uuid)
language sql stable security definer set search_path = public as $$
  select v.id, v.modelo_id
    from public.viaturas_com_disponibilidade(p_inicio, p_fim, p_org_id) d
    join public.viaturas v on v.id = d.viatura_id and v.org_id = p_org_id
   where d.disponivel
     and v.modelo_id is not null
     and coalesce(v.status, 'disponivel') not in ('inativo', 'manutencao', 'em_recolha')
     and (v.data_venda is null or v.data_venda > (p_inicio at time zone 'Europe/Lisbon')::date)
     and not exists (
       select 1 from public.motorista_viaturas mv
        where mv.viatura_id = v.id
          and mv.org_id = p_org_id
          and mv.status = 'ativo'
          and (mv.data_inicio is null or mv.data_inicio <= (p_fim at time zone 'Europe/Lisbon')::date)
          and (mv.data_fim is null or mv.data_fim >= (p_inicio at time zone 'Europe/Lisbon')::date));
$$;

create or replace function public.api_quantidade_disponivel(
  p_org_id uuid, p_modelo_id uuid, p_inicio timestamptz, p_fim timestamptz)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.api_viaturas_livres(p_org_id, p_inicio, p_fim) l
   where l.modelo_id = p_modelo_id;
$$;

-- Cartão de api_modelos + quantidade livre + cotação base (só aluguer).
-- A frota livre e os cartões calculam-se uma vez para todos os modelos.
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
      ), cartoes as (
        select x as cartao, (x->>'id')::uuid as modelo_id
          from jsonb_array_elements(public.api_modelos(p_org_id, p_categoria, p_tipo)) x
      )
      select jsonb_agg(c.cartao || jsonb_build_object(
               'quantidade_disponivel', l.q,
               'cotacao', jsonb_build_object(
                 'dias', v_dias,
                 'preco_dia', public.api_preco_json(pr.preco_dia, v_iva),
                 'aluguer', public.api_preco_json(pr.preco_dia * v_dias, v_iva),
                 'franquia', public.api_preco_json(pr.franquia_valor, v_iva),
                 'caucao', public.api_preco_json(pr.caucao_valor, v_iva),
                 'km_incluidos', pr.km_mensal))
             order by c.cartao->>'marca', c.cartao->>'modelo')
        from cartoes c
        join livres l on l.modelo_id = c.modelo_id
        join public.renting_tarifa_precos_modelo pr
          on pr.modelo_id = c.modelo_id and pr.tarifa_id = v_tarifa and pr.org_id = p_org_id
    ), '[]'::jsonb));
end $$;

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
    'quantidade', v_dias, 'preco_unitario', public.api_preco_json(v_m.preco_dia, v_iva), 'total', public.api_preco_json(v_valor, v_iva));

  if p_cobertura_id is not null then
    select * into v_cob from public.renting_coberturas where id = p_cobertura_id and org_id = p_org_id and ativa;
    if not found then return public.api_erro('NAO_ENCONTRADO', 'Cobertura não encontrada.'); end if;
    v_tem_cobertura := true; v_cob_franquia := v_cob.franquia_valor;
    v_valor := v_cob.preco_dia * v_dias; v_total := v_total + v_valor;
    v_linhas := v_linhas || jsonb_build_object('tipo', 'cobertura', 'descricao', v_cob.nome,
      'quantidade', v_dias, 'preco_unitario', public.api_preco_json(v_cob.preco_dia, v_iva), 'total', public.api_preco_json(v_valor, v_iva));
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
      'quantidade', v_qtd::int, 'preco_unitario', public.api_preco_json(v_e.preco_unidade, v_iva),
      'total', public.api_preco_json(v_valor, v_iva));
  end loop;

  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'dias', v_dias),
    'modelo', jsonb_build_object('id', v_m.modelo_id, 'marca', v_m.marca, 'modelo', v_m.modelo),
    'linhas', v_linhas,
    'subtotal', public.api_preco_json(v_total, v_iva),
    'franquia', public.api_preco_json(case when v_tem_cobertura then v_cob_franquia else v_pr.franquia_valor end, v_iva),
    'caucao', public.api_preco_json(v_pr.caucao_valor, v_iva),
    'km_incluidos', v_pr.km_mensal,
    'km_adicional', public.api_preco_json(v_pr.km_adicional_valor, v_iva),
    'quantidade_disponivel', v_q);
end $$;

-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated em cada função nova. Nomeiam-se os três.
do $$
declare f text;
begin
  foreach f in array array[
    'api_erro(text, text)', 'api_dias(timestamptz, timestamptz)',
    'api_validar_periodo(uuid, timestamptz, timestamptz, uuid, uuid)',
    'api_viaturas_livres(uuid, timestamptz, timestamptz)',
    'api_quantidade_disponivel(uuid, uuid, timestamptz, timestamptz)',
    'api_disponibilidade(uuid, timestamptz, timestamptz, uuid, uuid, uuid, text)',
    'api_cotacao(uuid, uuid, timestamptz, timestamptz, uuid, uuid, jsonb, uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
