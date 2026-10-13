-- ============================================================
-- API do site: a foto de cada modelo passa a ser a de uma viatura
-- ============================================================
-- imagem_url dos cartões de modelo (rent-a-car e TVDE) deixa de vir de
-- viatura_modelos.imagem_url. O SQL entrega a chave interna foto_path (caminho
-- da capa no bucket viatura-documentos) e imagem_url a null; a edge assina o
-- caminho (24 h), preenche imagem_url e retira foto_path antes de responder.
-- Aplicar DEPOIS de publicar a edge: a edge antiga devolvia foto_path tal e qual.
-- Categorias (renting_grupos.imagem_url) não mudam. Mesmas assinaturas: sem DROP.
-- ============================================================

-- Capa (viatura_capas) de uma viatura da org desse modelo, não vendida e não slot.
-- A view não filtra por org: o isolamento vem de viaturas.org_id e da org da foto.
-- ficheiro_url é texto do cliente e a edge assina-o com service_role: só passa um
-- caminho da própria viatura (<viatura_id>/fotos/...), sem '..'. Escolhe-se a
-- capa mais recente, com a matrícula a desempatar.
create or replace function public.api_foto_modelo(p_org_id uuid, p_modelo_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select c.ficheiro_url
    from public.viaturas v
    join public.viatura_capas c on c.viatura_id = v.id
    join public.viatura_documentos vd on vd.id = c.foto_id
   where v.org_id = p_org_id
     and vd.org_id = p_org_id
     and c.ficheiro_url like (v.id::text || '/fotos/%')
     and c.ficheiro_url not like '%..%'
     and v.modelo_id = p_modelo_id
     and coalesce(v.is_vendida, false) = false
     and coalesce(v.is_slot, false) = false
   order by vd.created_at desc nulls last, v.matricula, v.id
   limit 1;
$$;

-- Igual à 20261001120000, com imagem_url a null e foto_path para a edge.
create or replace function public.api_modelos(p_org_id uuid, p_categoria uuid default null, p_tipo text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.modelo_id, 'marca', m.marca, 'modelo', m.modelo,
    'categoria', case when m.grupo_id is null then null else jsonb_build_object('id', m.grupo_id, 'nome', m.grupo_nome) end,
    'tipo', m.tipo, 'caixa', m.caixa, 'combustivel', m.combustivel, 'lugares', m.lugares,
    'portas', m.portas, 'bagageira', m.bagageira, 'ar_condicionado', m.ar_condicionado,
    'imagem_url', null::text,
    'foto_path', public.api_foto_modelo(p_org_id, m.modelo_id),
    'preco_dia', public.api_preco_json(m.preco_dia, public.api_iva_rent_a_car(p_org_id)),
    'frota', m.frota)), '[]'::jsonb)
  from public.api_modelos_publicaveis(p_org_id) m
  where (p_categoria is null or m.grupo_id = p_categoria)
    and (p_tipo is null or m.tipo = p_tipo);
$$;

-- Igual à 20261006100000, com imagem_url a null e foto_path para a edge.
create or replace function public.api_tvde_modelos(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.modelo_id, 'marca', m.marca, 'modelo', m.modelo,
    'categoria', case when m.grupo_id is null then null else jsonb_build_object('id', m.grupo_id, 'nome', m.grupo_nome) end,
    'caixa', m.caixa, 'combustivel', m.combustivel, 'lugares', m.lugares,
    'portas', m.portas, 'bagageira', m.bagageira, 'ar_condicionado', m.ar_condicionado,
    'imagem_url', null::text,
    'foto_path', public.api_foto_modelo(p_org_id, m.modelo_id),
    'preco_semana', public.api_preco_json(m.preco_semana, i.iva),
    'caucao', public.api_preco_json(m.caucao, i.iva),
    'franquia', public.api_preco_json(m.franquia, i.iva),
    'km_incluidos', m.km_mensal,
    'km_adicional', public.api_preco_json(m.km_adicional, i.iva),
    'frota', m.frota) order by m.marca, m.modelo), '[]'::jsonb)
  from public.api_tvde_modelos_publicaveis(p_org_id) m
  cross join (select public.api_iva_tvde(p_org_id) as iva) i;
$$;

-- api_modelo, api_tvde_modelo e as duas disponibilidades reutilizam estes cartões.
do $$
declare f text;
begin
  foreach f in array array[
    'api_foto_modelo(uuid, uuid)', 'api_modelos(uuid, uuid, text)', 'api_tvde_modelos(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
