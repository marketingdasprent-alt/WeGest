-- ============================================================
-- API do site: só mostra o que se pode alugar
-- ============================================================
-- Rent-a-car: o levantamento tem de ser nos próximos 15 dias, e o catálogo
-- (GET /modelos) só lista modelos com pelo menos um dia livre nesse prazo,
-- com a data do primeiro (disponivel_desde). Um carro num contrato que acaba
-- daqui a 4 dias aparece a partir do 5.º dia, como já fazia a disponibilidade.
-- TVDE: aluguer de longa duração, por isso só conta o que está livre HOJE e
-- sem fim à vista; a data pedida é só a do levantamento.
-- Preço 0 € na tarifa do site deixa de ser publicável.
--
-- A lista que o site vê passa a filtrar; o detalhe, a disponibilidade, a
-- cotação e a candidatura continuam a ler os cartões sem filtro (_cartoes),
-- para um modelo ocupado não lhes desaparecer.
-- ============================================================

-- ── 1. Levantamento até 15 dias ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.api_validar_periodo(p_org_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_entrega uuid, p_recolha uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_inicio > now() + interval '15 days' then
    return public.api_erro('PERIODO_INVALIDO', 'O levantamento tem de ser nos próximos 15 dias.');
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
end $function$;

-- ── 2. Preço 0 € não é publicável ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.api_modelos_publicaveis(p_org_id uuid)
 RETURNS TABLE(modelo_id uuid, marca text, modelo text, grupo_id uuid, grupo_nome text, tipo text, caixa text, combustivel text, lugares smallint, portas smallint, bagageira smallint, ar_condicionado boolean, imagem_url text, preco_dia numeric, frota integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     and p.preco_dia > 0
   order by ma.nome, m.nome;
$function$;

CREATE OR REPLACE FUNCTION public.api_tvde_modelos_publicaveis(p_org_id uuid)
 RETURNS TABLE(modelo_id uuid, marca text, modelo text, grupo_id uuid, grupo_nome text, caixa text, combustivel text, lugares smallint, portas smallint, bagageira smallint, ar_condicionado boolean, imagem_url text, preco_semana numeric, caucao numeric, franquia numeric, km_mensal integer, km_adicional numeric, frota integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     and p.preco_semana > 0
   order by ma.nome, m.nome;
$function$;

-- ── 3. Rent-a-car: cartões sem filtro e primeiro dia livre ──────────────────
-- O corpo antigo de api_modelos: todos os modelos publicáveis, sem datas.
create or replace function public.api_modelos_cartoes(
  p_org_id uuid, p_categoria uuid default null, p_tipo text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.modelo_id, 'marca', m.marca, 'modelo', m.modelo,
    'categoria', case when m.grupo_id is null then null else jsonb_build_object('id', m.grupo_id, 'nome', m.grupo_nome) end,
    'tipo', m.tipo, 'caixa', m.caixa, 'combustivel', m.combustivel, 'lugares', m.lugares,
    'portas', m.portas, 'bagageira', m.bagageira, 'ar_condicionado', m.ar_condicionado,
    'imagem_url', null::text,
    'foto_path', public.api_foto_modelo(p_org_id, m.modelo_id),
    'preco_dia', public.api_preco_json_iva_incluido(m.preco_dia, public.api_iva_rent_a_car(p_org_id)),
    'frota', m.frota) order by m.marca, m.modelo), '[]'::jsonb)
  from public.api_modelos_publicaveis(p_org_id) m
  where (p_categoria is null or m.grupo_id = p_categoria)
    and (p_tipo is null or m.tipo = p_tipo);
$$;

-- Primeiro dia (Lisboa) com uma viatura livre durante 24 h, nas 15 janelas de
-- 24 h a contar de agora, com a mesma conta da disponibilidade (livres menos
-- procura sem viatura). Um modelo sem nenhuma janela livre não aparece.
create or replace function public.api_modelos_disponivel_desde(p_org_id uuid)
returns table (modelo_id uuid, disponivel_desde date)
language sql stable security definer set search_path = '' as $$
  with janelas as (
    select k, now() + make_interval(days => k) as i, now() + make_interval(days => k + 1) as f
      from generate_series(0, 14) k
  ), livres as (
    select j.k, j.i, l.modelo_id, count(*)::int as q
      from janelas j
      cross join lateral public.api_viaturas_livres(p_org_id, j.i, j.f) l
     group by j.k, j.i, l.modelo_id
  ), procura as (
    select j.k, s.modelo_id, s.n
      from janelas j
      cross join lateral public.api_procura_sem_viatura(p_org_id, j.i, j.f) s
  )
  select l.modelo_id, min((l.i at time zone 'Europe/Lisbon')::date)
    from livres l
    left join procura p on p.k = l.k and p.modelo_id = l.modelo_id
   where l.q - coalesce(p.n, 0) > 0
   group by l.modelo_id;
$$;

-- A lista do site: só modelos com um dia livre nos próximos 15, com essa data.
create or replace function public.api_modelos(
  p_org_id uuid, p_categoria uuid default null, p_tipo text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x || jsonb_build_object('disponivel_desde', d.disponivel_desde)
                            order by x->>'marca', x->>'modelo'), '[]'::jsonb)
    from jsonb_array_elements(public.api_modelos_cartoes(p_org_id, p_categoria, p_tipo)) x
    join public.api_modelos_disponivel_desde(p_org_id) d on d.modelo_id = (x->>'id')::uuid;
$$;

-- Detalhe: lê os cartões sem filtro (um link do site não pode partir) e diz
-- quando há dia livre; null quando não há nenhum nos próximos 15 dias.
CREATE OR REPLACE FUNCTION public.api_modelo(p_org_id uuid, p_modelo_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (select x from jsonb_array_elements(public.api_modelos_cartoes(p_org_id)) x where (x->>'id')::uuid = p_modelo_id)
      || jsonb_build_object(
    'disponivel_desde', (select d.disponivel_desde from public.api_modelos_disponivel_desde(p_org_id) d
                          where d.modelo_id = p_modelo_id),
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
$function$;

-- Disponibilidade: igual, mas sobre os cartões sem filtro (a conta das datas
-- pedidas é dela, não do catálogo).
CREATE OR REPLACE FUNCTION public.api_disponibilidade(p_org_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_entrega uuid, p_recolha uuid, p_categoria uuid DEFAULT NULL::uuid, p_tipo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          from jsonb_array_elements(public.api_modelos_cartoes(p_org_id, p_categoria, p_tipo)) x
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
end $function$;

-- ── 4. TVDE: só o que está livre hoje ───────────────────────────────────────
-- O corpo antigo de api_tvde_modelos: todos os modelos TVDE publicáveis.
create or replace function public.api_tvde_modelos_cartoes(p_org_id uuid)
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

-- Viaturas TVDE livres de agora em diante (sem fim): longa duração não se
-- promete a quem só fica livre mais tarde. Menos a procura já sem viatura.
create or replace function public.api_tvde_livres_hoje(p_org_id uuid)
returns table (modelo_id uuid, quantidade integer)
language sql stable security definer set search_path = '' as $$
  with livres as (
    select l.modelo_id, count(*)::int as q
      from public.api_viaturas_livres(p_org_id, now(), 'infinity'::timestamptz) l
      join public.api_tvde_viaturas_elegiveis(p_org_id) e on e.viatura_id = l.viatura_id
     group by l.modelo_id
  )
  select l.modelo_id, (l.q - coalesce(sv.n, 0))::int
    from livres l
    left join public.api_procura_sem_viatura(p_org_id, now(), 'infinity'::timestamptz) sv
      on sv.modelo_id = l.modelo_id
   where l.q - coalesce(sv.n, 0) > 0;
$$;

-- A lista do site: só modelos com viatura livre hoje.
create or replace function public.api_tvde_modelos(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'marca', x->>'modelo'), '[]'::jsonb)
    from jsonb_array_elements(public.api_tvde_modelos_cartoes(p_org_id)) x
    join public.api_tvde_livres_hoje(p_org_id) h on h.modelo_id = (x->>'id')::uuid;
$$;

-- Detalhe e validação da candidatura: sem filtro (o modelo pretendido de uma
-- candidatura não deixa de existir por estar ocupado hoje).
CREATE OR REPLACE FUNCTION public.api_tvde_modelo(p_org_id uuid, p_modelo_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select x from jsonb_array_elements(public.api_tvde_modelos_cartoes(p_org_id)) x
   where (x->>'id')::uuid = p_modelo_id;
$function$;

-- A data pedida é só o levantamento: a conta é a de hoje (api_tvde_livres_hoje).
CREATE OR REPLACE FUNCTION public.api_tvde_disponibilidade(p_org_id uuid, p_inicio timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_de date;
  v_ate date;
begin
  if p_inicio is null or p_inicio <= now() or p_inicio > now() + interval '180 days' then
    return public.api_erro('PERIODO_INVALIDO',
      'inicio tem de estar no futuro e a no máximo 180 dias.');
  end if;
  if public.api_tarifa_site_tvde(p_org_id) is null then
    return public.api_erro('CONFIG_EM_FALTA', 'A organização não tem tarifa TVDE do site.');
  end if;
  -- Mesma regra do rent-a-car (api_validar_periodo): fora da validade não há preço.
  select t.valido_de, t.valido_ate into v_de, v_ate
    from public.renting_tarifas t
   where t.id = public.api_tarifa_site_tvde(p_org_id) and t.org_id = p_org_id;
  if (v_de is not null and (p_inicio at time zone 'Europe/Lisbon')::date < v_de)
     or (v_ate is not null and (p_inicio at time zone 'Europe/Lisbon')::date > v_ate) then
    return public.api_erro('TARIFA_INDISPONIVEL', 'Ainda não há preços TVDE para esta data.');
  end if;
  return jsonb_build_object(
    'inicio', p_inicio,
    'modelos', coalesce((
      select jsonb_agg(x || jsonb_build_object('quantidade_disponivel', h.quantidade)
                       order by x->>'marca', x->>'modelo')
        from jsonb_array_elements(public.api_tvde_modelos_cartoes(p_org_id)) x
        join public.api_tvde_livres_hoje(p_org_id) h on h.modelo_id = (x->>'id')::uuid
    ), '[]'::jsonb));
end $function$;

-- ── 5. Grants ───────────────────────────────────────────────────────────────
-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated em cada função nova. Nomeiam-se os três.
do $$
declare f text;
begin
  foreach f in array array[
    'api_validar_periodo(uuid, timestamptz, timestamptz, uuid, uuid)',
    'api_modelos_publicaveis(uuid)',
    'api_tvde_modelos_publicaveis(uuid)',
    'api_modelos_cartoes(uuid, uuid, text)',
    'api_modelos_disponivel_desde(uuid)',
    'api_modelos(uuid, uuid, text)',
    'api_modelo(uuid, uuid)',
    'api_disponibilidade(uuid, timestamptz, timestamptz, uuid, uuid, uuid, text)',
    'api_tvde_modelos_cartoes(uuid)',
    'api_tvde_livres_hoje(uuid)',
    'api_tvde_modelos(uuid)',
    'api_tvde_modelo(uuid, uuid)',
    'api_tvde_disponibilidade(uuid, timestamptz)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
