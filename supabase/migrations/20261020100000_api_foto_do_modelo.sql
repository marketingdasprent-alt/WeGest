-- ============================================================
-- API do site: a foto de cada modelo volta a ser a do modelo
-- ============================================================
-- Desfaz a 20261006140000: imagem_url dos cartões (rent-a-car e TVDE) vem de
-- viatura_modelos.imagem_url, carregada na aba Modelos. A capa das viaturas
-- deixa de ir para o site, sem recurso a ela quando o modelo não tem foto.
-- Os cartões deixam de levar foto_path; a edge já deixa como está um cartão
-- sem foto_path, por isso não precisa de ser publicada antes.
-- Categorias (renting_grupos.imagem_url) não mudam. Mesmas assinaturas: sem DROP.
-- ============================================================

-- imagem_url é texto do cliente (o formulário só aceita o bucket, mas a base
-- não). Ao site só sai uma foto do bucket público modelos-viaturas, na pasta
-- da própria org; qualquer outro URL sai null.
create or replace function public.api_imagem_modelo(p_org_id uuid, p_url text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_url ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/modelos-viaturas/'
                  || p_org_id::text || '/[^/?#]+(\?v=[0-9]+)?$')
    then p_url
  end;
$$;

-- Igual à 20261014190000, com a foto do modelo e sem foto_path.
create or replace function public.api_modelos_cartoes(
  p_org_id uuid, p_categoria uuid default null, p_tipo text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.modelo_id, 'marca', m.marca, 'modelo', m.modelo,
    'categoria', case when m.grupo_id is null then null else jsonb_build_object('id', m.grupo_id, 'nome', m.grupo_nome) end,
    'tipo', m.tipo, 'caixa', m.caixa, 'combustivel', m.combustivel, 'lugares', m.lugares,
    'portas', m.portas, 'bagageira', m.bagageira, 'ar_condicionado', m.ar_condicionado,
    'imagem_url', public.api_imagem_modelo(p_org_id, m.imagem_url),
    'preco_dia', public.api_preco_json_iva_incluido(m.preco_dia, public.api_iva_rent_a_car(p_org_id)),
    'frota', m.frota) order by m.marca, m.modelo), '[]'::jsonb)
  from public.api_modelos_publicaveis(p_org_id) m
  where (p_categoria is null or m.grupo_id = p_categoria)
    and (p_tipo is null or m.tipo = p_tipo);
$$;

-- Igual à 20261014190000, com a foto do modelo e sem foto_path.
create or replace function public.api_tvde_modelos_cartoes(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.modelo_id, 'marca', m.marca, 'modelo', m.modelo,
    'categoria', case when m.grupo_id is null then null else jsonb_build_object('id', m.grupo_id, 'nome', m.grupo_nome) end,
    'caixa', m.caixa, 'combustivel', m.combustivel, 'lugares', m.lugares,
    'portas', m.portas, 'bagageira', m.bagageira, 'ar_condicionado', m.ar_condicionado,
    'imagem_url', public.api_imagem_modelo(p_org_id, m.imagem_url),
    'preco_semana', public.api_preco_json_iva_incluido(m.preco_semana, i.iva),
    'caucao', public.api_preco_json_iva_incluido(m.caucao, i.iva),
    'franquia', public.api_preco_json_iva_incluido(m.franquia, i.iva),
    'km_incluidos', m.km_mensal,
    'km_adicional', public.api_preco_json_iva_incluido(m.km_adicional, i.iva),
    'frota', m.frota) order by m.marca, m.modelo), '[]'::jsonb)
  from public.api_tvde_modelos_publicaveis(p_org_id) m
  cross join (select public.api_iva_tvde(p_org_id) as iva) i;
$$;

-- Ninguém mais a chama.
drop function if exists public.api_foto_modelo(uuid, uuid);

-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated em cada função nova. Nomeiam-se os três.
do $$
declare f text;
begin
  foreach f in array array[
    'api_imagem_modelo(uuid, text)',
    'api_modelos_cartoes(uuid, uuid, text)',
    'api_tvde_modelos_cartoes(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
