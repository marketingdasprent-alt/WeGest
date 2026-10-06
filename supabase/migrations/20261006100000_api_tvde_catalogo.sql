-- ============================================================
-- API do site, fase D1: catálogo e disponibilidade TVDE
-- ============================================================
-- A tarifa do site passa a ser uma por organização e por tipo: a 'renting'
-- continua a alimentar o rent-a-car, a 'tvde' alimenta /v1/tvde/*.
-- Mesmas regras das fases A-C: SECURITY DEFINER, p_org_id explícito (nunca
-- get_current_org_id()), só o service_role executa.
-- ============================================================

-- Antes desta migração o índice era (org_id): verificado a 06-10 que nenhuma
-- org tem uma tarifa 'tvde' com tarifa_site activa, por isso entra sem conflito.
drop index if exists public.renting_tarifas_site_unica;
create unique index renting_tarifas_site_unica
  on public.renting_tarifas (org_id, tipo) where tarifa_site and ativa;

comment on column public.renting_tarifas.tarifa_site is
  'Tarifa cujos preços por modelo a API do site publica. Uma activa por organização e por tipo (renting = rent-a-car, tvde = aluguer semanal).';

-- Rent-a-car lê só a tarifa 'renting'. Mesma assinatura: os chamadores não mudam.
create or replace function public.api_tarifa_site(p_org_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.renting_tarifas
   where org_id = p_org_id and ativa and tarifa_site and tipo = 'renting' limit 1;
$$;

create or replace function public.api_tarifa_site_tvde(p_org_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.renting_tarifas
   where org_id = p_org_id and ativa and tarifa_site and tipo = 'tvde' limit 1;
$$;

create or replace function public.api_iva_tvde(p_org_id uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select iva_tvde from public.org_definicoes where org_id = p_org_id), 6);
$$;

-- Viaturas que podem fazer TVDE: tipo elegível, não vendidas, não slot
-- (o critério de useModelosElegiveisTvde).
create or replace function public.api_tvde_viaturas_elegiveis(p_org_id uuid)
returns table (viatura_id uuid, modelo_id uuid)
language sql stable security definer set search_path = '' as $$
  select v.id, v.modelo_id
    from public.viaturas v
    join public.viatura_tipos t on t.id = v.tipo_id and t.elegivel_tvde
   where v.org_id = p_org_id
     and v.modelo_id is not null
     and coalesce(v.is_vendida, false) = false
     and coalesce(v.is_slot, false) = false;
$$;

-- Modelo publicável TVDE: frota elegível, caixa e lugares preenchidos e
-- preço/semana na tarifa TVDE do site. Sem tipo: o TVDE é sempre de passageiros.
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
     and m.caixa is not null and m.lugares is not null
     and p.preco_semana is not null
   order by ma.nome, m.nome;
$$;

-- Preços da tarifa sem IVA; o IVA é o TVDE da org (6% por omissão).
create or replace function public.api_tvde_modelos(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.modelo_id, 'marca', m.marca, 'modelo', m.modelo,
    'categoria', case when m.grupo_id is null then null else jsonb_build_object('id', m.grupo_id, 'nome', m.grupo_nome) end,
    'caixa', m.caixa, 'combustivel', m.combustivel, 'lugares', m.lugares,
    'portas', m.portas, 'bagageira', m.bagageira, 'ar_condicionado', m.ar_condicionado,
    'imagem_url', m.imagem_url,
    'preco_semana', public.api_preco_json(m.preco_semana, i.iva),
    'caucao', public.api_preco_json(m.caucao, i.iva),
    'franquia', public.api_preco_json(m.franquia, i.iva),
    'km_incluidos', m.km_mensal,
    'km_adicional', public.api_preco_json(m.km_adicional, i.iva),
    'frota', m.frota) order by m.marca, m.modelo), '[]'::jsonb)
  from public.api_tvde_modelos_publicaveis(p_org_id) m
  cross join (select public.api_iva_tvde(p_org_id) as iva) i;
$$;

-- O cartão de um modelo, ou null se ele não for publicável.
create or replace function public.api_tvde_modelo(p_org_id uuid, p_modelo_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select x from jsonb_array_elements(public.api_tvde_modelos(p_org_id)) x
   where (x->>'id')::uuid = p_modelo_id;
$$;

-- O contrato TVDE não tem fim: a viatura só conta se estiver livre de inicio
-- até 'infinity'. Desconta-se a procura sem viatura do modelo (Fase C), por
-- onde os sinais da D3 vão entrar.
create or replace function public.api_tvde_disponibilidade(p_org_id uuid, p_inicio timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_inicio is null or p_inicio <= now() or p_inicio > now() + interval '180 days' then
    return public.api_erro('PERIODO_INVALIDO',
      'inicio tem de estar no futuro e a no máximo 180 dias.');
  end if;
  if public.api_tarifa_site_tvde(p_org_id) is null then
    return public.api_erro('CONFIG_EM_FALTA', 'A organização não tem tarifa TVDE do site.');
  end if;
  return jsonb_build_object(
    'inicio', p_inicio,
    'modelos', coalesce((
      with livres as (
        select l.modelo_id, count(*)::int as q
          from public.api_viaturas_livres(p_org_id, p_inicio, 'infinity'::timestamptz) l
          join public.api_tvde_viaturas_elegiveis(p_org_id) e on e.viatura_id = l.viatura_id
         group by l.modelo_id
      ), saldo as (
        select l.modelo_id, l.q - coalesce(sv.n, 0) as q
          from livres l
          left join public.api_procura_sem_viatura(p_org_id, p_inicio, 'infinity'::timestamptz) sv
            on sv.modelo_id = l.modelo_id
      )
      select jsonb_agg(x || jsonb_build_object('quantidade_disponivel', s.q)
                       order by x->>'marca', x->>'modelo')
        from jsonb_array_elements(public.api_tvde_modelos(p_org_id)) x
        join saldo s on s.modelo_id = (x->>'id')::uuid and s.q > 0
    ), '[]'::jsonb));
end $$;

-- Igual à 20261001100000, só com a whitelist alargada a 'tvde:catalogo:read'.
create or replace function public.api_chaves_criar(
  p_nome text, p_escopo text, p_permissoes text[], p_expira_em timestamptz, p_ip_whitelist text[]
) returns table (id uuid, chave text, prefixo text)
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.get_current_org_id();
  v_chave text;
  v_id uuid;
begin
  if v_org is null or not public.is_current_user_admin() then
    raise exception 'Só administradores da organização criam chaves de API';
  end if;
  if not coalesce(p_permissoes, '{}') <@ array['catalogo:read', 'disponibilidade:read', 'reservas:read', 'reservas:write', 'tvde:catalogo:read'] then
    raise exception 'Permissão desconhecida';
  end if;
  if p_expira_em is not null and p_expira_em <= now() then
    raise exception 'Expiração no passado';
  end if;
  v_chave := 'wg_ra_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_chaves
    (org_id, nome, escopo, permissoes, ativo, ip_whitelist, rate_limit_per_minute,
     expires_at, api_key_hash, prefixo, created_by)
  values
    (v_org, p_nome, p_escopo, coalesce(p_permissoes, '{}'), true, p_ip_whitelist, 120,
     p_expira_em, encode(extensions.digest(v_chave, 'sha256'), 'hex'), left(v_chave, 10), auth.uid())
  returning api_chaves.id into v_id;
  return query select v_id, v_chave, left(v_chave, 10);
end $$;

-- api_chaves_criar é do browser (admin): mantém os grants da 20261001100000.
revoke execute on function public.api_chaves_criar(text, text, text[], timestamptz, text[]) from public, anon;
grant execute on function public.api_chaves_criar(text, text, text[], timestamptz, text[]) to authenticated;

-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated em cada função nova. Nomeiam-se os três.
do $$
declare f text;
begin
  foreach f in array array[
    'api_tarifa_site(uuid)', 'api_tarifa_site_tvde(uuid)', 'api_iva_tvde(uuid)',
    'api_tvde_viaturas_elegiveis(uuid)', 'api_tvde_modelos_publicaveis(uuid)',
    'api_tvde_modelos(uuid)', 'api_tvde_modelo(uuid, uuid)',
    'api_tvde_disponibilidade(uuid, timestamptz)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
