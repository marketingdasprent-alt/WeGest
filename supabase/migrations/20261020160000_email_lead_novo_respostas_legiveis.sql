-- O email "Lead novo" mostrava em Observações o JSON cru do formulário público
-- (Catarina Isabel Teles Matos, 2026-10-20), com o nome, o email e o telefone
-- que já vêm em cima. O formulário grava as respostas assim em observacoes.
--
-- Agora as respostas saem uma por linha, "Etiqueta: valor", logo a seguir a
-- "Formulário": o layout (formatarCorpo) faz de cada uma uma linha da tabela,
-- como os outros campos. A nota do reenvio (20261020150000) passa a usar a
-- mesma conversão.

-- ============================================================================
-- 1. Respostas do formulário em texto
-- ============================================================================

create or replace function public.lead_respostas_legiveis(
  p_observacoes text,
  p_sem_formacao_tvde boolean default false
)
returns text
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_texto     text := nullif(btrim(p_observacoes), '');
  v_respostas json;
  v_linhas    text;
begin
  if v_texto is null then
    return null;
  end if;

  begin
    v_respostas := v_texto::json;
  exception when others then
    v_respostas := null;
  end;

  -- A landing e quem cria o lead à mão gravam texto simples.
  if json_typeof(v_respostas) is distinct from 'object' then
    return 'Observações: ' || regexp_replace(v_texto, '\s*\n\s*', ' ', 'g');
  end if;

  -- json (não jsonb) para manter a ordem das perguntas do formulário.
  select string_agg(r.etiqueta || ': ' || r.valor, E'\n' order by r.ordem)
    into v_linhas
    from (
      select c.ordem,
             coalesce(nullif(btrim(c.valor ->> 'label'), ''), c.chave) as etiqueta,
             regexp_replace(btrim(
               case when json_typeof(c.valor -> 'value') = 'array'
                    then (select string_agg(e, ', ') from json_array_elements_text(c.valor -> 'value') as e)
                    else c.valor ->> 'value'
               end), '\s*\n\s*', ' ', 'g') as valor
        from json_each(v_respostas) with ordinality as c(chave, valor, ordem)
       where json_typeof(c.valor) = 'object'
         -- Nome, email e telefone já são colunas do lead.
         and coalesce(c.valor ->> 'type', '') not in ('email', 'tel')
         and c.chave not ilike 'nome%'
         and not (p_sem_formacao_tvde and c.chave ilike '%formacao_tvde%')
    ) r
   where nullif(r.valor, '') is not null;

  return v_linhas;
end;
$function$;

comment on function public.lead_respostas_legiveis(text, boolean) is
  'Respostas do formulário público (JSON em leads_dasprent.observacoes) em linhas "Etiqueta: valor", sem nome, email e telefone. Ver 20261020160000.';

revoke all on function public.lead_respostas_legiveis(text, boolean) from public, anon, authenticated;

-- ============================================================================
-- 2. O evento lead.novo leva as respostas legíveis
-- ============================================================================
-- Redefinição integral da 20261020120000; só muda 'observacoes'.

create or replace function public.fn_lead_novo_domain_event()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_formulario text;
  v_contacto   text;
begin
  begin
    select f.nome into v_formulario
      from public.formularios f
     where f.id = new.formulario_id;

    v_contacto := new.email || coalesce(', ' || nullif(btrim(new.telefone), ''), '');

    insert into public.domain_events
      (org_id, event_type, entity_table, entity_id, payload, emitted_by)
    values (
      new.org_id,
      'lead.novo',
      'leads_dasprent',
      new.id,
      jsonb_build_object(
        'nome',          new.nome,
        'email',         new.email,
        'telefone',      coalesce(nullif(btrim(new.telefone), ''), 'não indicado'),
        'zona',          coalesce(nullif(btrim(new.zona), ''), 'não indicada'),
        'tipo_viatura',  coalesce(nullif(btrim(new.tipo_viatura), ''), 'não indicado'),
        'data_aluguer',  coalesce(to_char(new.data_aluguer, 'DD/MM/YYYY'), 'não indicada'),
        'formacao_tvde', case new.tem_formacao_tvde when true then 'sim' when false then 'não'
                              else 'não indicado' end,
        'formulario',    coalesce(v_formulario, 'não indicado'),
        -- Já com etiquetas, uma resposta por linha (a Formação TVDE tem linha própria).
        'observacoes',   coalesce(public.lead_respostas_legiveis(new.observacoes, true),
                                  'Observações: sem observações'),
        'mensagem',      'Lead novo: ' || new.nome || ' (' || v_contacto || ')'
                         || coalesce('. Zona: ' || nullif(btrim(new.zona), ''), '') || '.'
      ),
      'trigger'
    );
  exception when others then
    raise warning 'fn_lead_novo_domain_event: lead % entrou sem aviso: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$;

comment on function public.fn_lead_novo_domain_event() is
  'Publica lead.novo em domain_events quando entra um lead em leads_dasprent. Nunca bloqueia o INSERT. Ver 20261020120000 e 20261020160000.';

revoke all on function public.fn_lead_novo_domain_event() from public, anon, authenticated;

-- ============================================================================
-- 3. Template: as respostas entram na tabela, sem "Observações:" à frente
-- ============================================================================
-- Só os que ainda estão como a seed os deixou: um template editado no painel
-- fica como o utilizador o escreveu.

update public.notification_templates
   set corpo_template =
         E'Entrou um lead novo pelo formulário. Abra-o no CRM para o atribuir e contactar.\n\n' ||
         E'Nome: {{nome}}\nEmail: {{email}}\nTelefone: {{telefone}}\nZona: {{zona}}\n' ||
         E'Tipo de viatura: {{tipo_viatura}}\nData pretendida: {{data_aluguer}}\n' ||
         E'Formação TVDE: {{formacao_tvde}}\nFormulário: {{formulario}}\n{{observacoes}}',
       versao = versao + 1,
       updated_at = now()
 where codigo = 'lead.novo'
   and canal = 'email'
   and corpo_template =
         E'Entrou um lead novo pelo formulário. Abra-o no CRM para o atribuir e contactar.\n\n' ||
         E'Nome: {{nome}}\nEmail: {{email}}\nTelefone: {{telefone}}\nZona: {{zona}}\n' ||
         E'Tipo de viatura: {{tipo_viatura}}\nData pretendida: {{data_aluguer}}\n' ||
         E'Formação TVDE: {{formacao_tvde}}\nFormulário: {{formulario}}\n\n' ||
         E'Observações: {{observacoes}}';

-- Redefinição integral da 20261020120000; só muda o corpo do template.
create or replace function public.seed_alerta_lead_novo(p_org_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cargo  uuid;
  v_grupo  uuid := gen_random_uuid();
  v_config jsonb;
begin
  insert into public.notification_templates
    (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, versao, ativo)
  values (
    p_org_id, 'lead.novo', 'email', 'pt-PT',
    'Lead novo: {{nome}}',
    -- Uma linha "Etiqueta: valor" por campo: o layout (formatarCorpo) faz a
    -- tabela. {{observacoes}} já traz as respostas assim, uma por linha.
    E'Entrou um lead novo pelo formulário. Abra-o no CRM para o atribuir e contactar.\n\n' ||
    E'Nome: {{nome}}\nEmail: {{email}}\nTelefone: {{telefone}}\nZona: {{zona}}\n' ||
    E'Tipo de viatura: {{tipo_viatura}}\nData pretendida: {{data_aluguer}}\n' ||
    E'Formação TVDE: {{formacao_tvde}}\nFormulário: {{formulario}}\n{{observacoes}}',
    'html', 1, true
  )
  on conflict do nothing;

  select c.id into v_cargo
    from public.cargos c
   where c.org_id = p_org_id and lower(btrim(c.nome)) = 'gestor tvde'
   order by c.created_at
   limit 1;

  if v_cargo is null then
    select c.id into v_cargo
      from public.cargos c
     where c.org_id = p_org_id and c.nome = 'Administrador'
     order by c.created_at
     limit 1;
  end if;

  if v_cargo is null then
    raise warning
      'seed_alerta_lead_novo: organização % sem cargo "Gestor TVDE" nem "Administrador", regras não criadas.',
      p_org_id;
    return;
  end if;

  v_config := jsonb_build_object(
    'titulo', 'Lead novo',
    'template_codigo', 'lead.novo',
    'destinatarios_estrategia', 'cargo',
    'destinatarios_cargo_ids', jsonb_build_array(v_cargo)
  );

  -- Duas linhas, um grupo: o executor só escreve no sino para 'notificacao' e
  -- só mete na fila de email para 'email' (ver 20260922130000).
  insert into public.automation_rules
    (org_id, codigo, nome, descricao, event_type, condicoes, acao_tipo, acao_config,
     prioridade, cooldown_minutos, ativo, grupo_id)
  values
    (p_org_id, 'lead.novo', 'Lead novo',
     'Avisa os gestores quando entra um lead novo pelo formulário.',
     'lead.novo', '[]'::jsonb, 'notificacao', v_config, 'media', 0, true, v_grupo),
    (p_org_id, 'lead.novo.email', 'Lead novo (email)',
     'Envia por correio o que a regra lead.novo mostra no sino.',
     'lead.novo', '[]'::jsonb, 'email', v_config, 'media', 0, true, v_grupo)
  on conflict (codigo, org_id) do nothing;
end;
$function$;

revoke all on function public.seed_alerta_lead_novo(uuid) from public, anon, authenticated;
grant execute on function public.seed_alerta_lead_novo(uuid) to service_role;

-- ============================================================================
-- 4. A nota do reenvio usa a mesma conversão
-- ============================================================================
-- Redefinição integral da 20261020150000; só muda a forma de ler as respostas.

create or replace function public.lead_reenvio_junta_ao_existente()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email     text := nullif(lower(btrim(new.email)), '');
  v_telefone  text := right(regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g'), 9);
  v_existente uuid;
begin
  if coalesce(auth.role(), '') <> 'anon' and new.formulario_id is null then
    return new;
  end if;

  if length(v_telefone) <> 9 then
    v_telefone := null;
  end if;
  if v_email is null and v_telefone is null then
    return new;
  end if;

  -- Dois cliques seguidos chegam em paralelo e nenhum veria o outro. Ordem
  -- fixa (email, depois telefone) para não haver deadlock.
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended('lead:' || new.org_id || ':' || v_email, 0));
  end if;
  if v_telefone is not null then
    perform pg_advisory_xact_lock(hashtextextended('lead:' || new.org_id || ':' || v_telefone, 0));
  end if;

  select l.id
    into v_existente
    from public.leads_dasprent l
   where l.org_id = new.org_id
     and l.created_at > now() - interval '24 hours'
     and (
       (v_email is not null and lower(btrim(l.email)) = v_email)
       or (v_telefone is not null
           and right(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), 9) = v_telefone)
     )
   order by l.created_at desc
   limit 1;

  if v_existente is null then
    return new;
  end if;

  update public.leads_dasprent l
     set observacoes_gestores = concat_ws(
           E'\n\n',
           nullif(btrim(l.observacoes_gestores), ''),
           concat_ws(
             E'\n',
             'Voltou a enviar o formulário a '
               || to_char(now() at time zone 'Europe/Lisbon', 'DD/MM/YYYY "às" HH24:MI') || '.',
             public.lead_respostas_legiveis(new.observacoes)
           )
         ),
         campaign_tags = array(
           select distinct t
             from unnest(coalesce(l.campaign_tags, '{}') || coalesce(new.campaign_tags, '{}')) as t
            order by t
         ),
         updated_at = now()
   where l.id = v_existente;

  -- Sem linha nova: nem webhook nem aviso de lead novo em duplicado.
  return null;
end;
$function$;

revoke all on function public.lead_reenvio_junta_ao_existente() from public, anon, authenticated;

notify pgrst, 'reload schema';
