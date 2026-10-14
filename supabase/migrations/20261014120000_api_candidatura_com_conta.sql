-- ============================================================
-- API do site: candidatura TVDE ligada à conta do motorista
-- ============================================================
-- O site da Década passa a criar contas de motorista no Supabase Auth do
-- WeGest. Com sessão, a edge valida o token (X-Motorista-Token) e passa o
-- user_id: a candidatura fica com conta e a ficha aprovada também. Sem
-- token tudo continua como na D2 (user_id nulo).
--
-- Regras da conta: membro da org da chave, tipo motorista, sem ficha na org
-- e sem outra candidatura; o email do pedido tem de ser o da conta.
-- A aprovação não muda: a conta só segue para uma ficha NOVA. Uma ficha que
-- já existe (encontrada pelo NIF) nunca recebe a conta do site, porque a
-- confirmação de email está desligada e nem NIF nem email provam identidade.
-- ============================================================

-- ── 1. Resumo com com_conta ─────────────────────────────────────────────────
create or replace function public.api_tvde_candidatura_resumo(p_org_id uuid, p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'estado', c.status,
                            'criada_em', c.created_at, 'decidida_em', c.data_decisao,
                            'com_conta', c.user_id is not null)
    from public.motorista_candidaturas c
   where c.id = p_id and c.org_id = p_org_id and c.origem = 'site';
$$;

-- ── 2. Criar com p_user_id ──────────────────────────────────────────────────
-- Um parâmetro novo com default criava uma segunda função ao lado da antiga
-- (chamada com 3 argumentos ambígua): sai a antiga.
drop function if exists public.api_tvde_criar_candidatura(uuid, uuid, jsonb);

create or replace function public.api_tvde_criar_candidatura(
  p_org_id uuid, p_api_chave_id uuid, p_pedido jsonb, p_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ref    text := p_pedido->>'referencia_externa';
  v_nif    text := regexp_replace(p_pedido->>'nif', '\s', '', 'g');
  v_email  text := lower(p_pedido->>'email');
  v_iban   text := p_pedido->>'iban';
  v_modelo uuid := (p_pedido->>'modelo_pretendido_id')::uuid;
  v_doc    jsonb := p_pedido->'documento';
  v_carta  jsonb := p_pedido->'carta_conducao';
  v_tvde   jsonb := p_pedido->'licenca_tvde';
  v_conta_email text;
  v_id     uuid;
begin
  -- nif_pt_valido e iban_valido são STRICT: com null devolvem null, não false.
  if not coalesce(public.nif_pt_valido(v_nif), false) then
    return public.api_erro('PARAMETRO_INVALIDO', 'nif não é um NIF português válido.');
  end if;
  if not coalesce(public.iban_valido(v_iban), false) then
    return public.api_erro('PARAMETRO_INVALIDO', 'iban não é válido.');
  end if;
  -- Serializa pedidos da mesma pessoa: duas referências com o mesmo NIF em paralelo
  -- não podem passar ambas o teste de duplicado.
  perform pg_advisory_xact_lock(hashtext('api_candidatura:' || p_org_id::text || ':' || v_nif));

  -- Duas candidaturas da mesma conta com NIFs diferentes não passam ambas o teste.
  if p_user_id is not null then
    perform pg_advisory_xact_lock(hashtext('api_candidatura_user:' || p_user_id::text));
  end if;

  select c.id into v_id from public.motorista_candidaturas c
   where c.org_id = p_org_id and c.api_chave_id = p_api_chave_id
     and c.referencia_externa = v_ref;
  if v_id is not null then
    -- A repetição só devolve a candidatura a quem a criou (com conta, a mesma conta).
    if p_user_id is not null and not exists (
        select 1 from public.motorista_candidaturas c where c.id = v_id and c.user_id = p_user_id) then
      return public.api_erro('CANDIDATURA_EXISTENTE', 'Esta referencia_externa já foi usada.');
    end if;
    return public.api_tvde_candidatura_resumo(p_org_id, v_id) || '{"repetida": true}'::jsonb;
  end if;

  if p_user_id is not null then
    -- A chave é de uma org: uma conta de outra org (ou de um colaborador) não entra.
    select lower(u.email) into v_conta_email
      from auth.users u
      join public.profiles p on p.id = u.id
     where u.id = p_user_id
       and p.tipo_utilizador = 'motorista'
       and exists (select 1 from public.user_organizacoes uo
                    where uo.user_id = u.id and uo.org_id = p_org_id);
    if v_conta_email is null then
      return public.api_erro('CONTA_INVALIDA',
        'A conta não é de um motorista desta organização.');
    end if;
    if v_conta_email is distinct from v_email then
      return public.api_erro('PARAMETRO_INVALIDO', 'email tem de ser o da conta do motorista.');
    end if;
    if exists (select 1 from public.motoristas_ativos m
                where m.org_id = p_org_id and m.user_id = p_user_id) then
      return public.api_erro('CANDIDATURA_EXISTENTE',
        'Esta conta já está associada a um motorista desta organização.');
    end if;
    -- user_id é UNIQUE em motorista_candidaturas: uma conta, uma candidatura.
    if exists (select 1 from public.motorista_candidaturas c where c.user_id = p_user_id) then
      return public.api_erro('CANDIDATURA_EXISTENTE', 'Esta conta já tem uma candidatura.');
    end if;
  end if;

  if v_modelo is not null and public.api_tvde_modelo(p_org_id, v_modelo) is null then
    return public.api_erro('NAO_ENCONTRADO',
      'modelo_pretendido_id não é um modelo TVDE publicado.');
  end if;
  if exists (
    select 1 from public.motorista_candidaturas c
     where c.org_id = p_org_id
       and c.status in ('rascunho', 'submetido', 'em_analise')
       and (regexp_replace(coalesce(c.nif, ''), '\D', '', 'g') = v_nif
            or lower(c.email) = v_email)) then
    return public.api_erro('CANDIDATURA_EXISTENTE',
      'Já existe uma candidatura em curso com este NIF ou email.');
  end if;

  begin
    insert into public.motorista_candidaturas (
      org_id, user_id, origem, api_chave_id, referencia_externa, status, data_submissao,
      nome, email, telefone, nif, morada, codigo_postal, cidade,
      documento_tipo, documento_numero, documento_validade,
      carta_conducao, carta_categorias, carta_validade,
      licenca_tvde_numero, licenca_tvde_validade, em_formacao_tvde,
      iban, modelo_pretendido_id, data_inicio_pretendida, observacoes,
      consentimento_versao, consentimento_em)
    values (
      p_org_id, p_user_id, 'site', p_api_chave_id, v_ref, 'submetido', now(),
      p_pedido->>'nome', v_email, p_pedido->>'telefone', v_nif,
      p_pedido->>'morada', p_pedido->>'codigo_postal', p_pedido->>'cidade',
      v_doc->>'tipo', v_doc->>'numero', (v_doc->>'validade')::date,
      v_carta->>'numero',
      array(select jsonb_array_elements_text(v_carta->'categorias')),
      (v_carta->>'validade')::date,
      v_tvde->>'numero', (v_tvde->>'validade')::date,
      coalesce((p_pedido->>'em_formacao_tvde')::boolean, false),
      v_iban, v_modelo, (p_pedido->>'data_inicio_pretendida')::date, p_pedido->>'observacoes',
      p_pedido->'consentimento'->>'versao', (p_pedido->'consentimento'->>'aceite_em')::timestamptz)
    returning id into v_id;
  exception when unique_violation then
    -- A mesma referência com outro NIF ao mesmo tempo: o lock é por NIF e não a
    -- apanha, mas o índice único sim. Quem chegou primeiro ganha.
    select c.id into v_id from public.motorista_candidaturas c
     where c.org_id = p_org_id and c.api_chave_id = p_api_chave_id
       and c.referencia_externa = v_ref;
    -- Se a violação veio de outro índice (ex.: user_id em paralelo), o erro segue.
    if v_id is null then
      raise;
    end if;
    return public.api_tvde_candidatura_resumo(p_org_id, v_id) || '{"repetida": true}'::jsonb;
  end;

  return public.api_tvde_candidatura_resumo(p_org_id, v_id);
end $$;

-- ── 3. Campos da API fora do alcance do motorista ───────────────────────────
-- Com user_id, a candidatura do site fica editável pelo motorista (policy
-- "Motoristas podem atualizar sua candidatura"). Estes campos são da API e do
-- registo: o dono não os muda (ex.: tomar a referencia_externa de outro).
-- Repõe em vez de recusar, para o formulário do portal continuar a gravar.
create or replace function public.candidatura_campos_da_api_imutaveis()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and auth.uid() = old.user_id then
    new.org_id := old.org_id;
    new.user_id := old.user_id;
    new.origem := old.origem;
    new.api_chave_id := old.api_chave_id;
    new.referencia_externa := old.referencia_externa;
    new.consentimento_versao := old.consentimento_versao;
    new.consentimento_em := old.consentimento_em;
    new.anonimizada_em := old.anonimizada_em;
  end if;
  return new;
end $$;

revoke execute on function public.candidatura_campos_da_api_imutaveis() from public, anon, authenticated;

drop trigger if exists trg_candidatura_campos_da_api_imutaveis on public.motorista_candidaturas;
create trigger trg_candidatura_campos_da_api_imutaveis
  before update on public.motorista_candidaturas
  for each row execute function public.candidatura_campos_da_api_imutaveis();

-- ── 4. Grants ───────────────────────────────────────────────────────────────
-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated em cada função nova. Nomeiam-se os três.
do $$
declare f text;
begin
  foreach f in array array[
    'api_tvde_candidatura_resumo(uuid, uuid)',
    'api_tvde_criar_candidatura(uuid, uuid, jsonb, uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
