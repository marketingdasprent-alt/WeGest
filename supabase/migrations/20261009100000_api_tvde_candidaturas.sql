-- ============================================================
-- API do site, TVDE fase D2: candidaturas de motoristas
-- ============================================================
-- O site cria candidaturas (POST /v1/tvde/candidaturas) e consulta o estado
-- (GET /v1/tvde/candidaturas/{id}). A candidatura entra como 'submetido', sem
-- conta de utilizador, e a equipa aprova-a no ecrã de candidaturas.
--
-- Mesmas regras da D1: as api_* recebem p_org_id explícito (nunca
-- get_current_org_id()), são SECURITY DEFINER com search_path vazio e só o
-- service_role as executa. Erros de negócio voltam como
-- { erro: { codigo, mensagem } }; a edge traduz o código para HTTP.
--
-- O sino "Novo motorista pendente" já sai do trigger antigo
-- trg_notificar_motorista_pendente em qualquer INSERT com status 'submetido':
-- não há evento novo, para não duplicar o aviso.
-- ============================================================

-- ── 1. Colunas ──────────────────────────────────────────────────────────────
alter table public.motorista_candidaturas
  alter column user_id drop not null,
  add column if not exists origem text not null default 'portal',
  add column if not exists api_chave_id uuid references public.api_chaves(id) on delete set null,
  add column if not exists referencia_externa text,
  add column if not exists modelo_pretendido_id uuid
    references public.viatura_modelos(id) on delete set null,
  add column if not exists data_inicio_pretendida date,
  add column if not exists em_formacao_tvde boolean not null default false,
  add column if not exists consentimento_em timestamptz,
  add column if not exists consentimento_versao text,
  add column if not exists anonimizada_em timestamptz;

alter table public.motorista_candidaturas
  drop constraint if exists motorista_candidaturas_origem_check,
  drop constraint if exists motorista_candidaturas_conta_check;
alter table public.motorista_candidaturas
  add constraint motorista_candidaturas_origem_check check (origem in ('portal', 'site')),
  -- O portal precisa sempre de conta; só o site cria candidaturas sem utilizador.
  add constraint motorista_candidaturas_conta_check check (origem = 'site' or user_id is not null);

-- Idempotência: a mesma referência da mesma chave nunca cria duas candidaturas.
create unique index if not exists motorista_candidaturas_referencia_site
  on public.motorista_candidaturas (org_id, api_chave_id, referencia_externa)
  where referencia_externa is not null;

comment on column public.motorista_candidaturas.origem is
  'portal: o motorista com conta no portal; site: a API do site, sem conta (user_id nulo).';
comment on column public.motorista_candidaturas.anonimizada_em is
  'Quando os dados pessoais foram apagados (candidaturas do site rejeitadas há mais de 6 meses).';

-- ── 2. Resumo, criar e obter ────────────────────────────────────────────────
-- O resumo só vê candidaturas do site da própria org: o GET nunca devolve
-- uma do portal nem de outra organização.
create or replace function public.api_tvde_candidatura_resumo(p_org_id uuid, p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'estado', c.status,
                            'criada_em', c.created_at, 'decidida_em', c.data_decisao)
    from public.motorista_candidaturas c
   where c.id = p_id and c.org_id = p_org_id and c.origem = 'site';
$$;

create or replace function public.api_tvde_obter_candidatura(p_org_id uuid, p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(public.api_tvde_candidatura_resumo(p_org_id, p_id),
                  public.api_erro('NAO_ENCONTRADO', 'Candidatura não encontrada.'));
$$;

-- O formato (email, datas, categorias, consentimento) já vem validado da
-- edge; aqui ficam os checksums de NIF e IBAN, o modelo e os duplicados.
create or replace function public.api_tvde_criar_candidatura(
  p_org_id uuid, p_api_chave_id uuid, p_pedido jsonb)
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

  select c.id into v_id from public.motorista_candidaturas c
   where c.org_id = p_org_id and c.api_chave_id = p_api_chave_id
     and c.referencia_externa = v_ref;
  if v_id is not null then
    return public.api_tvde_candidatura_resumo(p_org_id, v_id) || '{"repetida": true}'::jsonb;
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
      p_org_id, null, 'site', p_api_chave_id, v_ref, 'submetido', now(),
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
    return public.api_tvde_candidatura_resumo(p_org_id, v_id) || '{"repetida": true}'::jsonb;
  end;

  return public.api_tvde_candidatura_resumo(p_org_id, v_id);
end $$;

-- ── 3. Aprovar ──────────────────────────────────────────────────────────────
-- Copiada de 20260918100001 (a última definição). Muda só isto:
--   * a candidatura tem de ser da org activa de quem aprova; antes qualquer
--     autenticado aprovava a de qualquer org, e a ficha nova caía na org de
--     quem aprovava;
--   * a mesma verificação de permissão de rejeitar_candidatura_motorista;
--   * aceita 'em_analise', que o ecrã já oferece;
--   * uma candidatura do site (user_id nulo) não entra em conflito com a conta
--     da ficha que encontra pelo NIF: associa-se e a conta fica;
--   * a ficha nova leva o org_id da candidatura.
CREATE OR REPLACE FUNCTION public.aprovar_candidatura_motorista(p_candidatura_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_candidatura RECORD;
    v_existente   RECORD;
    v_motorista_id UUID;
    v_nif         TEXT;
    v_accao       TEXT;
BEGIN
    SELECT * INTO v_candidatura
    FROM motorista_candidaturas
    WHERE id = p_candidatura_id;

    IF NOT FOUND OR v_candidatura.org_id IS DISTINCT FROM public.get_current_org_id() THEN
        RAISE EXCEPTION 'Candidatura não encontrada';
    END IF;

    -- A mesma regra de rejeitar_candidatura_motorista: só quem gere motoristas aprova.
    IF NOT (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')) THEN
        RAISE EXCEPTION 'Sem permissão para aprovar candidaturas';
    END IF;

    IF v_candidatura.status NOT IN ('submetido', 'em_analise') THEN
        RAISE EXCEPTION 'Candidatura não está em estado de análise';
    END IF;

    -- Só dígitos: em produção há NIFs escritos com espaços e pontos, e
    -- "123 456 789" tem de encontrar "123456789".
    v_nif := NULLIF(regexp_replace(COALESCE(v_candidatura.nif, ''), '\D', '', 'g'), '');

    -- ── Já existe ficha com este NIF nesta organização? ──────────────────
    -- Ordem de preferência: primeiro as que ainda não têm conta (é onde a
    -- conta nova deve entrar), depois as activas, e por fim a mais antiga —
    -- que é a original quando já há duplicados por limpar.
    IF v_nif IS NOT NULL THEN
        SELECT * INTO v_existente
        FROM motoristas_ativos m
        WHERE m.org_id = v_candidatura.org_id
          AND regexp_replace(COALESCE(m.nif, ''), '\D', '', 'g') = v_nif
        ORDER BY (m.user_id IS NOT NULL), (m.status_ativo IS NOT TRUE), m.created_at
        LIMIT 1;
    END IF;

    IF v_existente.id IS NOT NULL THEN
        -- Ficha já tomada por OUTRA conta: não se rouba nem se sobrepõe. O
        -- gestor tem de resolver à mão — ou são duas pessoas com o mesmo NIF
        -- (erro de dados), ou o motorista já tem conta e devia entrar nela.
        -- Uma candidatura do site não tem conta: não há conflito com a conta da ficha.
        IF v_candidatura.user_id IS NOT NULL
           AND v_existente.user_id IS NOT NULL
           AND v_existente.user_id IS DISTINCT FROM v_candidatura.user_id THEN
            RAISE EXCEPTION
              'Já existe um motorista com o NIF % (%) e com conta associada. Verifique antes de aprovar.',
              v_existente.nif, v_existente.nome;
        END IF;

        UPDATE motoristas_ativos SET
            nome        = COALESCE(v_candidatura.nome, nome),
            email       = COALESCE(v_candidatura.email, email),
            telefone    = COALESCE(v_candidatura.telefone, telefone),
            morada      = COALESCE(v_candidatura.morada, morada),
            cidade      = COALESCE(v_candidatura.cidade, cidade),
            codigo_postal = COALESCE(v_candidatura.codigo_postal, codigo_postal),
            documento_tipo     = COALESCE(v_candidatura.documento_tipo, documento_tipo),
            documento_numero   = COALESCE(v_candidatura.documento_numero, documento_numero),
            documento_validade = COALESCE(v_candidatura.documento_validade, documento_validade),
            carta_conducao   = COALESCE(v_candidatura.carta_conducao, carta_conducao),
            carta_categorias = COALESCE(v_candidatura.carta_categorias, carta_categorias),
            carta_validade   = COALESCE(v_candidatura.carta_validade, carta_validade),
            licenca_tvde_numero   = COALESCE(v_candidatura.licenca_tvde_numero, licenca_tvde_numero),
            licenca_tvde_validade = COALESCE(v_candidatura.licenca_tvde_validade, licenca_tvde_validade),
            documento_ficheiro_url = COALESCE(v_candidatura.documento_ficheiro_url, documento_ficheiro_url),
            documento_identificacao_verso_url =
              COALESCE(v_candidatura.documento_identificacao_verso_url, documento_identificacao_verso_url),
            carta_ficheiro_url       = COALESCE(v_candidatura.carta_ficheiro_url, carta_ficheiro_url),
            carta_conducao_verso_url = COALESCE(v_candidatura.carta_conducao_verso_url, carta_conducao_verso_url),
            licenca_tvde_ficheiro_url = COALESCE(v_candidatura.licenca_tvde_ficheiro_url, licenca_tvde_ficheiro_url),
            registo_criminal_url      = COALESCE(v_candidatura.registo_criminal_url, registo_criminal_url),
            comprovativo_morada_url   = COALESCE(v_candidatura.comprovativo_morada_url, comprovativo_morada_url),
            iban                  = COALESCE(v_candidatura.iban, iban),
            comprovativo_iban_url = COALESCE(v_candidatura.comprovativo_iban_url, comprovativo_iban_url),
            observacoes = COALESCE(v_candidatura.observacoes, observacoes),
            -- Aprovar é readmitir: uma ficha desactivada volta a activa e
            -- perde a data de saída, senão o motorista entra no painel e os
            -- ecrãs de contas continuam a escondê-lo.
            status_ativo = true,
            desativado_em = NULL,
            -- A contratação original não se reescreve; só se preenche quando
            -- a ficha nunca teve uma.
            data_contratacao = COALESCE(data_contratacao, CURRENT_DATE),
            user_id = COALESCE(v_candidatura.user_id, user_id),
            updated_at = NOW()
        WHERE id = v_existente.id;

        v_motorista_id := v_existente.id;
        v_accao := 'associado';
    ELSE
        INSERT INTO motoristas_ativos (
            org_id,
            nome, email, telefone, nif, morada, cidade,
            codigo_postal,
            documento_tipo, documento_numero, documento_validade,
            carta_conducao, carta_categorias, carta_validade,
            licenca_tvde_numero, licenca_tvde_validade,
            documento_ficheiro_url, documento_identificacao_verso_url,
            carta_ficheiro_url, carta_conducao_verso_url,
            licenca_tvde_ficheiro_url, registo_criminal_url,
            comprovativo_morada_url, iban, comprovativo_iban_url,
            observacoes, data_contratacao, status_ativo, user_id
        ) VALUES (
            v_candidatura.org_id,
            v_candidatura.nome, v_candidatura.email, v_candidatura.telefone,
            v_candidatura.nif, v_candidatura.morada, v_candidatura.cidade,
            v_candidatura.codigo_postal,
            v_candidatura.documento_tipo, v_candidatura.documento_numero,
            v_candidatura.documento_validade,
            v_candidatura.carta_conducao, v_candidatura.carta_categorias,
            v_candidatura.carta_validade,
            v_candidatura.licenca_tvde_numero, v_candidatura.licenca_tvde_validade,
            v_candidatura.documento_ficheiro_url,
            v_candidatura.documento_identificacao_verso_url,
            v_candidatura.carta_ficheiro_url, v_candidatura.carta_conducao_verso_url,
            v_candidatura.licenca_tvde_ficheiro_url, v_candidatura.registo_criminal_url,
            v_candidatura.comprovativo_morada_url, v_candidatura.iban,
            v_candidatura.comprovativo_iban_url,
            v_candidatura.observacoes, CURRENT_DATE, true, v_candidatura.user_id
        )
        RETURNING id INTO v_motorista_id;

        v_accao := 'criado';
    END IF;

    UPDATE motorista_candidaturas
    SET status = 'aprovado', data_decisao = NOW(), decidido_por = auth.uid()
    WHERE id = p_candidatura_id;

    RETURN jsonb_build_object('motorista_id', v_motorista_id, 'accao', v_accao);
END;
$function$;

COMMENT ON FUNCTION public.aprovar_candidatura_motorista(uuid) IS
  'Aprova uma candidatura da org activa (admin ou motoristas_gestao; submetido ou em_analise). Procura ficha existente pelo NIF (normalizado, na mesma org) e associa-lhe a conta em vez de criar ficha nova; so cria quando nao existe, na org da candidatura. Devolve {motorista_id, accao: associado|criado}. Recusa quando a ficha encontrada ja tem outra conta e a candidatura tambem tem conta.';

-- Grants iguais aos de 20260921140000: é o browser que aprova.
revoke all on function public.aprovar_candidatura_motorista(uuid) from public, anon;
grant execute on function public.aprovar_candidatura_motorista(uuid) to authenticated;

-- ── 4. Anonimização (RGPD) ──────────────────────────────────────────────────
-- Candidaturas do site rejeitadas há mais de 6 meses perdem os dados pessoais.
-- As do portal ficam como estão: mexer nelas é outra decisão. As aprovadas já
-- passaram para a ficha do motorista.
create or replace function public.api_tvde_anonimizar_candidaturas()
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ids  uuid[];
  v_runs uuid[];
begin
  with a as (
    update public.motorista_candidaturas c set
      nome = 'Candidatura anonimizada', email = 'anonimizada@invalid',
      telefone = null, nif = null, morada = null, cidade = null, codigo_postal = null,
      documento_tipo = null, documento_numero = null, documento_validade = null,
      carta_conducao = null, carta_categorias = null, carta_validade = null,
      licenca_tvde_numero = null, licenca_tvde_validade = null, iban = null,
      observacoes = null, motivo_rejeicao = null, anonimizada_em = now()
     where c.origem = 'site' and c.status = 'rejeitado' and c.anonimizada_em is null
       and coalesce(c.data_decisao, c.updated_at) < now() - interval '6 months'
    returning c.id)
  select coalesce(array_agg(id), '{}') into v_ids from a;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  -- O nome também ficou noutros sítios:
  -- o sino "Novo motorista pendente" (mensagem e a cópia em itens[].mensagem);
  update public.notificacoes n set
    mensagem = 'Candidatura anonimizada.',
    itens = (select jsonb_agg(i || '{"mensagem": "Candidatura anonimizada."}'::jsonb)
               from jsonb_array_elements(n.itens) i)
   where n.candidatura_id = any (v_ids);

  -- o payload dos eventos da candidatura parada e dos runs do motor que os copiaram;
  update public.domain_events e set payload = e.payload - 'nome' - 'email'
   where e.entity_table = 'motorista_candidaturas' and e.entity_id = any (v_ids);

  with r as (
    update public.automation_runs r set payload = r.payload - 'nome' - 'email'
     where r.entity_table = 'motorista_candidaturas' and r.entity_id = any (v_ids)
    returning r.id)
  select coalesce(array_agg(id), '{}') into v_runs from r;

  -- e os avisos que esses runs puseram no sino ("Candidatura de {{nome}} parada...").
  update public.notificacoes n set
    titulo = 'Candidatura anonimizada',
    mensagem = 'Candidatura anonimizada.',
    itens = (select jsonb_agg(i || '{"mensagem": "Candidatura anonimizada."}'::jsonb)
               from jsonb_array_elements(n.itens) i)
   where n.rule_run_id = any (v_runs);

  return cardinality(v_ids);
end $$;

comment on function public.api_tvde_anonimizar_candidaturas() is
  'RGPD: apaga os dados pessoais das candidaturas do site rejeitadas há mais de 6 meses, e o nome nos avisos e nos eventos ligados. Corre todos os dias pelo cron tvde_candidaturas_anonimizar.';

select cron.schedule('tvde_candidaturas_anonimizar', '41 4 * * *',
  $cron$ select public.api_tvde_anonimizar_candidaturas() $cron$)
where not exists (select 1 from cron.job where jobname = 'tvde_candidaturas_anonimizar');

-- ── 5. Permissões das chaves ────────────────────────────────────────────────
-- Igual à 20261006100000, só com a whitelist alargada às candidaturas TVDE.
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
  if not coalesce(p_permissoes, '{}') <@ array['catalogo:read', 'disponibilidade:read', 'reservas:read', 'reservas:write',
                                               'tvde:catalogo:read', 'tvde:candidaturas:read', 'tvde:candidaturas:write'] then
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

-- ── 6. Grants ───────────────────────────────────────────────────────────────
-- REVOKE FROM PUBLIC não chega: os default privileges dão EXECUTE a anon e
-- authenticated em cada função nova. Nomeiam-se os três.
do $$
declare f text;
begin
  foreach f in array array[
    'api_tvde_candidatura_resumo(uuid, uuid)',
    'api_tvde_criar_candidatura(uuid, uuid, jsonb)',
    'api_tvde_obter_candidatura(uuid, uuid)',
    'api_tvde_anonimizar_candidaturas()']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
