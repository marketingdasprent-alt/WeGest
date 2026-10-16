-- ============================================================
-- API do site: o motorista com conta gere a sua candidatura TVDE
-- ============================================================
-- Com sessão do site (conta Supabase Auth 'motorista'), a edge valida o token
-- e chama estas funções com service_role e o user_id: ver, guardar rascunho,
-- anexar documentos, submeter. Só o 'submetido' dispara o aviso de motorista
-- pendente (trg_notificar_motorista_pendente); o rascunho não.
-- Nunca se devolvem caminhos de ficheiros: só se o documento foi recebido.
-- user_id é UNIQUE em motorista_candidaturas: uma conta, uma candidatura.
-- ============================================================

-- ── 1. Auxiliares ───────────────────────────────────────────────────────────
-- Conta de motorista membro da org da chave (mesma regra de api_tvde_criar_candidatura).
create or replace function public.api_conta_candidatura_conta_ok(p_org_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user_id and p.tipo_utilizador = 'motorista'
       and exists (select 1 from public.user_organizacoes uo
                    where uo.user_id = p.id and uo.org_id = p_org_id));
$$;

-- Campos e documentos que ainda faltam para submeter.
create or replace function public.api_conta_candidatura_faltas(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campos', to_jsonb(array_remove(array[
      case when nullif(btrim(c.nome), '') is null then 'nome' end,
      case when nullif(btrim(c.email), '') is null then 'email' end,
      case when nullif(btrim(c.telefone), '') is null then 'telefone' end,
      case when nullif(btrim(c.nif), '') is null then 'nif' end,
      case when nullif(btrim(c.morada), '') is null then 'morada' end,
      case when nullif(btrim(c.codigo_postal), '') is null then 'codigo_postal' end,
      case when nullif(btrim(c.cidade), '') is null then 'cidade' end,
      case when c.documento_tipo is null then 'documento.tipo' end,
      case when nullif(btrim(c.documento_numero), '') is null then 'documento.numero' end,
      case when c.documento_validade is null then 'documento.validade' end,
      case when nullif(btrim(c.carta_conducao), '') is null then 'carta_conducao.numero' end,
      case when coalesce(cardinality(c.carta_categorias), 0) = 0 then 'carta_conducao.categorias' end,
      case when c.carta_validade is null then 'carta_conducao.validade' end,
      case when not c.em_formacao_tvde and nullif(btrim(c.licenca_tvde_numero), '') is null
           then 'licenca_tvde.numero' end,
      case when not c.em_formacao_tvde and c.licenca_tvde_validade is null
           then 'licenca_tvde.validade' end,
      case when nullif(btrim(c.iban), '') is null then 'iban' end,
      case when c.consentimento_versao is null or c.consentimento_em is null then 'consentimento' end
    ], null)),
    'documentos', to_jsonb(array_remove(array[
      case when c.documento_ficheiro_url is null then 'documento_frente' end,
      case when c.documento_identificacao_verso_url is null then 'documento_verso' end,
      case when c.carta_ficheiro_url is null then 'carta_frente' end,
      case when c.carta_conducao_verso_url is null then 'carta_verso' end,
      case when not c.em_formacao_tvde and c.licenca_tvde_ficheiro_url is null then 'licenca_tvde' end,
      case when c.registo_criminal_url is null then 'registo_criminal' end,
      case when c.comprovativo_morada_url is null then 'comprovativo_morada' end,
      case when c.comprovativo_iban_url is null then 'comprovativo_iban' end
    ], null)))
  from public.motorista_candidaturas c
  where c.id = p_id;
$$;

-- O formato que a API devolve (sem caminhos, sem user_id).
create or replace function public.api_conta_candidatura_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('candidatura', jsonb_build_object(
    'id', c.id,
    'estado', c.status,
    'motivo_rejeicao', case when c.status = 'rejeitado' then c.motivo_rejeicao end,
    'submetida_em', c.data_submissao,
    'dados', jsonb_build_object(
      'nome', c.nome, 'email', c.email, 'telefone', c.telefone, 'nif', c.nif,
      'morada', c.morada, 'codigo_postal', c.codigo_postal, 'cidade', c.cidade,
      'documento', jsonb_build_object('tipo', c.documento_tipo, 'numero', c.documento_numero,
                                      'validade', c.documento_validade),
      'carta_conducao', jsonb_build_object('numero', c.carta_conducao,
                                           'categorias', to_jsonb(coalesce(c.carta_categorias, '{}')),
                                           'validade', c.carta_validade),
      'licenca_tvde', case when c.licenca_tvde_numero is null and c.licenca_tvde_validade is null
                           then null
                           else jsonb_build_object('numero', c.licenca_tvde_numero,
                                                   'validade', c.licenca_tvde_validade) end,
      'em_formacao_tvde', c.em_formacao_tvde,
      'iban', c.iban,
      'modelo_pretendido_id', c.modelo_pretendido_id,
      'data_inicio_pretendida', c.data_inicio_pretendida,
      'observacoes', c.observacoes),
    'documentos', jsonb_build_object(
      'documento_frente', jsonb_build_object('recebido', c.documento_ficheiro_url is not null),
      'documento_verso', jsonb_build_object('recebido', c.documento_identificacao_verso_url is not null),
      'carta_frente', jsonb_build_object('recebido', c.carta_ficheiro_url is not null),
      'carta_verso', jsonb_build_object('recebido', c.carta_conducao_verso_url is not null),
      'licenca_tvde', jsonb_build_object('recebido', c.licenca_tvde_ficheiro_url is not null),
      'registo_criminal', jsonb_build_object('recebido', c.registo_criminal_url is not null),
      'comprovativo_morada', jsonb_build_object('recebido', c.comprovativo_morada_url is not null),
      'comprovativo_iban', jsonb_build_object('recebido', c.comprovativo_iban_url is not null)),
    'em_falta', f.j->'documentos',
    'campos_em_falta', f.j->'campos',
    'pode_submeter', c.status = 'rascunho'
                     and jsonb_array_length(f.j->'documentos') = 0
                     and jsonb_array_length(f.j->'campos') = 0))
  from public.motorista_candidaturas c
  cross join lateral (select public.api_conta_candidatura_faltas(c.id) as j) f
  where c.id = p_id;
$$;

-- ── 2. Ver ──────────────────────────────────────────────────────────────────
create or replace function public.api_conta_candidatura(p_org_id uuid, p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.api_conta_candidatura_conta_ok(p_org_id, p_user_id) then
    return public.api_erro('CONTA_INVALIDA', 'A conta não é de um motorista desta organização.');
  end if;
  select c.id into v_id from public.motorista_candidaturas c
   where c.user_id = p_user_id and c.org_id = p_org_id
   order by c.created_at desc limit 1;
  if v_id is null then
    return jsonb_build_object('candidatura', null);
  end if;
  return public.api_conta_candidatura_json(v_id);
end $$;

-- ── 3. Guardar rascunho ─────────────────────────────────────────────────────
-- Só as chaves presentes mudam; null limpa. Rascunho por passos: nada é obrigatório.
-- O consentimento entra aqui (versao, aceite_em) porque o submeter exige-o gravado.
create or replace function public.api_conta_candidatura_guardar(
  p_org_id uuid, p_api_chave_id uuid, p_user_id uuid, p_pedido jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_status text;
  v_conta_email text;
  v_chave text;
  v_nif text;
  v_doc jsonb := p_pedido->'documento';
  v_carta jsonb := p_pedido->'carta_conducao';
  v_tvde jsonb := p_pedido->'licenca_tvde';
  v_cons jsonb := p_pedido->'consentimento';
  v_doc_limpa boolean := coalesce(jsonb_typeof(p_pedido->'documento') = 'null', false);
  v_carta_limpa boolean := coalesce(jsonb_typeof(p_pedido->'carta_conducao') = 'null', false);
  v_tvde_limpa boolean := coalesce(jsonb_typeof(p_pedido->'licenca_tvde') = 'null', false);
  v_cons_versao text;
  v_cons_em timestamptz;
  v_modelo uuid;
  v_cats text[];
  v_doc_tipo text;
  v_doc_validade date;
  v_carta_validade date;
  v_tvde_validade date;
  v_inicio date;
  v_formacao boolean;
  v_formacao_presente boolean := false;
begin
  if p_pedido is null or jsonb_typeof(p_pedido) <> 'object' then
    return public.api_erro('PARAMETRO_INVALIDO', 'O pedido tem de ser um objecto.');
  end if;
  if not public.api_conta_candidatura_conta_ok(p_org_id, p_user_id) then
    return public.api_erro('CONTA_INVALIDA', 'A conta não é de um motorista desta organização.');
  end if;

  -- Tipos: texto ou null nos escalares; objecto ou null nos blocos. Chave
  -- ausente dá null no jsonb_typeof e passa.
  foreach v_chave in array array['nome', 'email', 'telefone', 'nif', 'morada', 'codigo_postal',
      'cidade', 'iban', 'modelo_pretendido_id', 'data_inicio_pretendida', 'observacoes'] loop
    if jsonb_typeof(p_pedido->v_chave) not in ('string', 'null') then
      return public.api_erro('PARAMETRO_INVALIDO', v_chave || ' tem de ser texto.');
    end if;
    if length(p_pedido->>v_chave) > 2000 then
      return public.api_erro('PARAMETRO_INVALIDO', v_chave || ' é demasiado longo.');
    end if;
  end loop;
  foreach v_chave in array array['documento', 'carta_conducao', 'licenca_tvde', 'consentimento'] loop
    if jsonb_typeof(p_pedido->v_chave) not in ('object', 'null') then
      return public.api_erro('PARAMETRO_INVALIDO', v_chave || ' tem de ser um objecto.');
    end if;
  end loop;
  if p_pedido ? 'em_formacao_tvde' then
    if jsonb_typeof(p_pedido->'em_formacao_tvde') <> 'boolean' then
      return public.api_erro('PARAMETRO_INVALIDO', 'em_formacao_tvde tem de ser booleano.');
    end if;
    v_formacao := (p_pedido->>'em_formacao_tvde')::boolean;
    v_formacao_presente := true;
  end if;

  -- O email é o da conta; o pedido só o pode repetir.
  select lower(u.email) into v_conta_email from auth.users u where u.id = p_user_id;
  if p_pedido ? 'email' and lower(p_pedido->>'email') is distinct from v_conta_email then
    return public.api_erro('PARAMETRO_INVALIDO', 'email tem de ser o da conta do motorista.');
  end if;
  if p_pedido ? 'nome' and nullif(btrim(p_pedido->>'nome'), '') is null then
    return public.api_erro('PARAMETRO_INVALIDO', 'nome não pode ser vazio.');
  end if;

  if p_pedido ? 'nif' then
    v_nif := nullif(regexp_replace(p_pedido->>'nif', '\s', '', 'g'), '');
    if v_nif is not null and not coalesce(public.nif_pt_valido(v_nif), false) then
      return public.api_erro('PARAMETRO_INVALIDO', 'nif não é um NIF português válido.');
    end if;
  end if;
  if nullif(btrim(p_pedido->>'iban'), '') is not null
     and not coalesce(public.iban_valido(p_pedido->>'iban'), false) then
    return public.api_erro('PARAMETRO_INVALIDO', 'iban não é válido.');
  end if;
  if nullif(btrim(p_pedido->>'codigo_postal'), '') is not null
     and (p_pedido->>'codigo_postal') !~ '^\d{4}-\d{3}$' then
    return public.api_erro('PARAMETRO_INVALIDO', 'codigo_postal tem de ter o formato 0000-000.');
  end if;
  if nullif(btrim(p_pedido->>'telefone'), '') is not null
     and (p_pedido->>'telefone') !~ '^\+?[0-9 ]{9,18}$' then
    return public.api_erro('PARAMETRO_INVALIDO', 'telefone não é válido.');
  end if;

  begin
    v_modelo := nullif(p_pedido->>'modelo_pretendido_id', '')::uuid;
    v_inicio := nullif(p_pedido->>'data_inicio_pretendida', '')::date;
    v_doc_validade := nullif(v_doc->>'validade', '')::date;
    v_carta_validade := nullif(v_carta->>'validade', '')::date;
    v_tvde_validade := nullif(v_tvde->>'validade', '')::date;
    v_cons_em := (v_cons->>'aceite_em')::timestamptz;
  exception when others then
    return public.api_erro('PARAMETRO_INVALIDO', 'Um identificador ou uma data não tem formato válido.');
  end;
  v_doc_tipo := nullif(v_doc->>'tipo', '');
  if v_doc_tipo is not null and v_doc_tipo not in ('cc', 'bi', 'ar', 'tr', 'passaporte') then
    return public.api_erro('PARAMETRO_INVALIDO', 'documento.tipo não é válido.');
  end if;
  if coalesce(v_carta ? 'categorias', false) then
    if jsonb_typeof(v_carta->'categorias') <> 'array'
       or exists (select 1 from jsonb_array_elements(v_carta->'categorias') e
                   where jsonb_typeof(e) <> 'string') then
      return public.api_erro('PARAMETRO_INVALIDO', 'carta_conducao.categorias tem de ser uma lista de texto.');
    end if;
    v_cats := array(select jsonb_array_elements_text(v_carta->'categorias'));
    if not v_cats <@ array['A', 'A1', 'A2', 'AM', 'B', 'B1', 'BE', 'C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'] then
      return public.api_erro('PARAMETRO_INVALIDO', 'carta_conducao.categorias tem categorias inválidas.');
    end if;
  end if;
  if jsonb_typeof(v_cons) = 'object' then
    v_cons_versao := nullif(btrim(v_cons->>'versao'), '');
    if v_cons_versao is null then
      return public.api_erro('PARAMETRO_INVALIDO', 'consentimento.versao é obrigatório.');
    end if;
    v_cons_em := coalesce(v_cons_em, now());
    if v_cons_em > now() + interval '5 minutes' then
      return public.api_erro('PARAMETRO_INVALIDO', 'consentimento.aceite_em não pode ser futuro.');
    end if;
  end if;
  if v_modelo is not null and public.api_tvde_modelo(p_org_id, v_modelo) is null then
    return public.api_erro('NAO_ENCONTRADO', 'modelo_pretendido_id não é um modelo TVDE publicado.');
  end if;

  -- Serializa por conta e por NIF (mesmos locks de api_tvde_criar_candidatura).
  perform pg_advisory_xact_lock(hashtext('api_candidatura_user:' || p_user_id::text));
  if v_nif is not null then
    perform pg_advisory_xact_lock(hashtext('api_candidatura:' || p_org_id::text || ':' || v_nif));
  end if;

  select c.id, c.status into v_id, v_status from public.motorista_candidaturas c
   where c.user_id = p_user_id and c.org_id = p_org_id
   order by c.created_at desc limit 1;

  if v_id is null then
    if exists (select 1 from public.motorista_candidaturas c where c.user_id = p_user_id) then
      return public.api_erro('CANDIDATURA_EXISTENTE', 'Esta conta já tem uma candidatura.');
    end if;
    if exists (select 1 from public.motoristas_ativos m
                where m.org_id = p_org_id and m.user_id = p_user_id) then
      return public.api_erro('CANDIDATURA_EXISTENTE',
        'Esta conta já está associada a um motorista desta organização.');
    end if;
  elsif v_status <> 'rascunho' then
    return public.api_erro('CANDIDATURA_NAO_EDITAVEL', 'A candidatura já foi submetida e não pode ser alterada.');
  end if;

  -- Outra candidatura em curso com o mesmo NIF ou o email da conta.
  if exists (
    select 1 from public.motorista_candidaturas c
     where c.org_id = p_org_id
       and c.user_id is distinct from p_user_id
       and c.status in ('rascunho', 'submetido', 'em_analise')
       and ((v_nif is not null and regexp_replace(coalesce(c.nif, ''), '\D', '', 'g') = v_nif)
            or lower(c.email) = v_conta_email)) then
    return public.api_erro('CANDIDATURA_EXISTENTE',
      'Já existe uma candidatura em curso com este NIF ou email.');
  end if;

  if v_id is null then
    insert into public.motorista_candidaturas (org_id, user_id, origem, api_chave_id, status, nome, email)
    values (p_org_id, p_user_id, 'site', p_api_chave_id, 'rascunho',
            coalesce(nullif(btrim(p_pedido->>'nome'), ''),
                     (select nullif(btrim(p.nome), '') from public.profiles p where p.id = p_user_id),
                     split_part(v_conta_email, '@', 1)),
            v_conta_email)
    returning id into v_id;
  end if;

  update public.motorista_candidaturas c set
    nome = coalesce(nullif(btrim(p_pedido->>'nome'), ''), c.nome),
    telefone = case when p_pedido ? 'telefone' then nullif(btrim(p_pedido->>'telefone'), '') else c.telefone end,
    nif = case when p_pedido ? 'nif' then v_nif else c.nif end,
    morada = case when p_pedido ? 'morada' then nullif(btrim(p_pedido->>'morada'), '') else c.morada end,
    codigo_postal = case when p_pedido ? 'codigo_postal' then nullif(btrim(p_pedido->>'codigo_postal'), '') else c.codigo_postal end,
    cidade = case when p_pedido ? 'cidade' then nullif(btrim(p_pedido->>'cidade'), '') else c.cidade end,
    documento_tipo = case when v_doc_limpa then null when coalesce(v_doc ? 'tipo', false) then v_doc_tipo else c.documento_tipo end,
    documento_numero = case when v_doc_limpa then null when coalesce(v_doc ? 'numero', false) then nullif(btrim(v_doc->>'numero'), '') else c.documento_numero end,
    documento_validade = case when v_doc_limpa then null when coalesce(v_doc ? 'validade', false) then v_doc_validade else c.documento_validade end,
    carta_conducao = case when v_carta_limpa then null when coalesce(v_carta ? 'numero', false) then nullif(btrim(v_carta->>'numero'), '') else c.carta_conducao end,
    carta_categorias = case when v_carta_limpa then null when coalesce(v_carta ? 'categorias', false) then v_cats else c.carta_categorias end,
    carta_validade = case when v_carta_limpa then null when coalesce(v_carta ? 'validade', false) then v_carta_validade else c.carta_validade end,
    licenca_tvde_numero = case when v_tvde_limpa then null when coalesce(v_tvde ? 'numero', false) then nullif(btrim(v_tvde->>'numero'), '') else c.licenca_tvde_numero end,
    licenca_tvde_validade = case when v_tvde_limpa then null when coalesce(v_tvde ? 'validade', false) then v_tvde_validade else c.licenca_tvde_validade end,
    em_formacao_tvde = case when v_formacao_presente then v_formacao else c.em_formacao_tvde end,
    iban = case when p_pedido ? 'iban' then nullif(btrim(p_pedido->>'iban'), '') else c.iban end,
    modelo_pretendido_id = case when p_pedido ? 'modelo_pretendido_id' then v_modelo else c.modelo_pretendido_id end,
    data_inicio_pretendida = case when p_pedido ? 'data_inicio_pretendida' then v_inicio else c.data_inicio_pretendida end,
    observacoes = case when p_pedido ? 'observacoes' then nullif(btrim(p_pedido->>'observacoes'), '') else c.observacoes end,
    consentimento_versao = case when v_cons_versao is not null then v_cons_versao else c.consentimento_versao end,
    consentimento_em = case when v_cons_versao is not null then v_cons_em else c.consentimento_em end
  where c.id = v_id;

  return public.api_conta_candidatura_json(v_id);
exception when unique_violation then
  -- Dois pedidos da mesma conta em paralelo: o índice único de user_id apanha o segundo.
  return public.api_erro('CANDIDATURA_EXISTENTE', 'Esta conta já tem uma candidatura.');
end $$;

-- ── 4. Documento ────────────────────────────────────────────────────────────
-- O ficheiro já foi para o storage (a edge). Aqui só se aceita um caminho da
-- própria conta, para uma conta nunca apontar para o ficheiro de outra.
create or replace function public.api_conta_candidatura_documento(
  p_org_id uuid, p_user_id uuid, p_tipo text, p_caminho text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_coluna text;
  v_id uuid;
  v_status text;
  v_antigo text;
  v_json jsonb;
begin
  v_coluna := case p_tipo
    when 'documento_frente' then 'documento_ficheiro_url'
    when 'documento_verso' then 'documento_identificacao_verso_url'
    when 'carta_frente' then 'carta_ficheiro_url'
    when 'carta_verso' then 'carta_conducao_verso_url'
    when 'licenca_tvde' then 'licenca_tvde_ficheiro_url'
    when 'registo_criminal' then 'registo_criminal_url'
    when 'comprovativo_morada' then 'comprovativo_morada_url'
    when 'comprovativo_iban' then 'comprovativo_iban_url'
  end;
  if v_coluna is null then
    return public.api_erro('PARAMETRO_INVALIDO', 'tipo de documento não é válido.');
  end if;
  if not public.api_conta_candidatura_conta_ok(p_org_id, p_user_id) then
    return public.api_erro('CONTA_INVALIDA', 'A conta não é de um motorista desta organização.');
  end if;
  if p_caminho is not null and (
       p_caminho like '%..%'
       or p_caminho !~* ('^' || p_user_id::text || '/candidatura/' || p_tipo
                         || '/[a-z0-9_-]([a-z0-9._-]*[a-z0-9_-])?\.(pdf|jpg|jpeg|png)$')) then
    return public.api_erro('PARAMETRO_INVALIDO', 'caminho não é válido para este documento.');
  end if;

  perform pg_advisory_xact_lock(hashtext('api_candidatura_user:' || p_user_id::text));
  select c.id, c.status into v_id, v_status from public.motorista_candidaturas c
   where c.user_id = p_user_id and c.org_id = p_org_id
   order by c.created_at desc limit 1;
  if v_id is null then
    return public.api_erro('NAO_ENCONTRADO', 'Candidatura não encontrada.');
  end if;
  if v_status <> 'rascunho' then
    return public.api_erro('CANDIDATURA_NAO_EDITAVEL', 'A candidatura já foi submetida e não pode ser alterada.');
  end if;

  execute format('select %I from public.motorista_candidaturas where id = $1', v_coluna)
    into v_antigo using v_id;
  execute format('update public.motorista_candidaturas set %I = $2 where id = $1', v_coluna)
    using v_id, p_caminho;

  v_json := public.api_conta_candidatura_json(v_id);
  -- Só para o servidor apagar o ficheiro do storage; a edge não o repassa ao site.
  if v_antigo is not null and v_antigo is distinct from p_caminho then
    v_json := v_json || jsonb_build_object('caminho_removido', v_antigo);
  end if;
  return v_json;
end $$;

-- ── 5. Submeter ─────────────────────────────────────────────────────────────
create or replace function public.api_conta_candidatura_submeter(p_org_id uuid, p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_status text;
  v_faltas jsonb;
  v_lista text;
begin
  if not public.api_conta_candidatura_conta_ok(p_org_id, p_user_id) then
    return public.api_erro('CONTA_INVALIDA', 'A conta não é de um motorista desta organização.');
  end if;
  perform pg_advisory_xact_lock(hashtext('api_candidatura_user:' || p_user_id::text));
  select c.id, c.status into v_id, v_status from public.motorista_candidaturas c
   where c.user_id = p_user_id and c.org_id = p_org_id
   order by c.created_at desc limit 1;
  if v_id is null then
    return public.api_erro('NAO_ENCONTRADO', 'Candidatura não encontrada.');
  end if;
  if v_status = 'submetido' then
    return public.api_conta_candidatura_json(v_id);
  end if;
  if v_status <> 'rascunho' then
    return public.api_erro('CANDIDATURA_NAO_EDITAVEL', 'A candidatura já foi submetida e não pode ser alterada.');
  end if;

  v_faltas := public.api_conta_candidatura_faltas(v_id);
  if jsonb_array_length(v_faltas->'campos') > 0 or jsonb_array_length(v_faltas->'documentos') > 0 then
    select string_agg(x, ', ') into v_lista
      from (select jsonb_array_elements_text(v_faltas->'campos') x
            union all select jsonb_array_elements_text(v_faltas->'documentos')) t;
    return jsonb_set(
      public.api_erro('CANDIDATURA_INCOMPLETA', 'Falta preencher: ' || v_lista || '.'),
      '{erro,em_falta}', v_faltas);
  end if;

  -- O trigger trg_notificar_motorista_pendente cria o aviso à equipa.
  update public.motorista_candidaturas
     set status = 'submetido', data_submissao = now()
   where id = v_id;
  return public.api_conta_candidatura_json(v_id);
end $$;

-- ── 6. Grants ───────────────────────────────────────────────────────────────
-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated em cada função nova. Nomeiam-se os três.
do $$
declare f text;
begin
  foreach f in array array[
    'api_conta_candidatura_conta_ok(uuid, uuid)',
    'api_conta_candidatura_faltas(uuid)',
    'api_conta_candidatura_json(uuid)',
    'api_conta_candidatura(uuid, uuid)',
    'api_conta_candidatura_guardar(uuid, uuid, uuid, jsonb)',
    'api_conta_candidatura_documento(uuid, uuid, text, text)',
    'api_conta_candidatura_submeter(uuid, uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
