-- Avisa os gestores TVDE quando entra um lead novo (sino + email).
--
-- Hoje um lead do formulário público entra em leads_dasprent e só dispara o
-- webhook "Lead Distância" (externo). Ninguém da equipa é avisado.
--
-- COMO
-- Evento lead.novo no motor de automação, pelo padrão de 20260922130000:
-- tipo, mapa, trigger que publica, regras gémeas notificacao+email por
-- organização, e o evento no catálogo do editor.
--
-- DECISÕES (utilizador, 20-10)
--   · Destinatários: cargo "Gestor TVDE" (nome sem distinguir maiúsculas, a
--     Premium Ride tem "GESTOR TVDE"). As orgs novas já o têm (ensure_base_cargos);
--     se alguém o renomear ou apagar, a regra aponta ao Administrador e o
--     resto muda-se na aba de automações.
--   · Email + sino.
--   · Link para /crm/lead/<id>: cada lead é uma entidade nova, logo a
--     supressão por (tipo, link) do process_domain_events nunca junta dois.
--   · Uma falha a publicar o evento NÃO pode perder o lead do formulário
--     público: o trigger apanha o erro e deixa só um aviso no log.

-- ============================================================================
-- 1. Tipo, mapa e link
-- ============================================================================

insert into public.notificacao_tipos (tipo, descricao)
values ('lead_novo', 'Entrou um lead novo pelo formulário: contactar.')
on conflict (tipo) do nothing;

insert into public.notificacao_tipo_map (event_type, tipo_legado)
values ('lead.novo', 'lead_novo')
on conflict (event_type) do nothing;

-- Redefinição integral da 20260916100000 mais leads_dasprent.
create or replace function public.notificacao_link_entidade(p_entity_table text, p_entity_id uuid)
 returns text
 language sql
 immutable
as $function$
  select case p_entity_table
    when 'viaturas'                 then '/viaturas/' || p_entity_id::text
    when 'motoristas_ativos'        then '/motoristas/' || p_entity_id::text
    when 'contratos_renting'        then '/renting/contratos/' || p_entity_id::text
    when 'profiles'                 then '/admin/utilizadores'
    when 'motorista_candidaturas'   then '/motoristas/candidaturas'
    when 'assistencia_tickets'      then '/assistencia/' || p_entity_id::text
    when 'plataformas_configuracao' then '/admin/settings?integracao=' || p_entity_id::text
    when 'leads_dasprent'           then '/crm/lead/' || p_entity_id::text
    else null
  end
$function$;

-- ============================================================================
-- 2. Quem emite
-- ============================================================================

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
        'observacoes',   coalesce(nullif(btrim(new.observacoes), ''), 'sem observações'),
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
  'Publica lead.novo em domain_events quando entra um lead em leads_dasprent. Nunca bloqueia o INSERT. Ver 20261020120000.';

revoke all on function public.fn_lead_novo_domain_event() from public, anon, authenticated;

drop trigger if exists trg_lead_novo_domain_event on public.leads_dasprent;
create trigger trg_lead_novo_domain_event
  after insert on public.leads_dasprent
  for each row execute function public.fn_lead_novo_domain_event();

-- ============================================================================
-- 3. Template e regras gémeas, por organização
-- ============================================================================

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
    -- tabela, como nos modelos de 20261001140000.
    E'Entrou um lead novo pelo formulário. Abra-o no CRM para o atribuir e contactar.\n\n' ||
    E'Nome: {{nome}}\nEmail: {{email}}\nTelefone: {{telefone}}\nZona: {{zona}}\n' ||
    E'Tipo de viatura: {{tipo_viatura}}\nData pretendida: {{data_aluguer}}\n' ||
    E'Formação TVDE: {{formacao_tvde}}\nFormulário: {{formulario}}\n\n' ||
    E'Observações: {{observacoes}}',
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

do $seed$
declare v_org record;
begin
  for v_org in select id from public.organizacoes loop
    perform public.seed_alerta_lead_novo(v_org.id);
  end loop;
end;
$seed$;

create or replace function public.tg_seed_alerta_lead_novo()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.seed_alerta_lead_novo(new.id);
  return null;
end;
$function$;

revoke all on function public.tg_seed_alerta_lead_novo() from public, anon, authenticated;

-- 'trigger_seed_...' ordena depois de 'trigger_auto_create_admin_cargo'. Não renomear.
drop trigger if exists trigger_seed_alerta_lead_novo on public.organizacoes;
create trigger trigger_seed_alerta_lead_novo
  after insert on public.organizacoes
  for each row execute function public.tg_seed_alerta_lead_novo();

-- ============================================================================
-- 4. Catálogo: o editor passa a conhecer os campos do evento
-- ============================================================================
-- Redefinição integral da 20260923100000 mais o evento novo. 'accoes' fica
-- igual: accoes_internas.test.sql fixa «exactamente três acções».

create or replace function public.automation_catalogo()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'eventos', jsonb_build_object(
      'assistencia_ticket.aberto_demasiado_tempo', jsonb_build_object(
        'label',    'Ticket aberto há demasiado tempo',
        'modulo',   'Assistência',
        'entidade', 'assistencia_tickets',
        'campos', jsonb_build_array(
          jsonb_build_object('id','prioridade','label','Prioridade','tipo','string'),
          jsonb_build_object('id','status',    'label','Estado',    'tipo','string')
        )
      ),
      'motorista.ficha_incompleta', jsonb_build_object(
        'label',    'Ficha de motorista incompleta',
        'modulo',   'Motoristas',
        'entidade', 'motoristas_ativos',
        'campos', jsonb_build_array(
          jsonb_build_object('id','nome','label','Nome','tipo','string')
        )
      ),
      'viatura.seguro_expirando', jsonb_build_object(
        'label',    'Seguro da viatura a expirar',
        'modulo',   'Viaturas',
        'entidade', 'viaturas',
        'campos', jsonb_build_array(
          jsonb_build_object('id','matricula','label','Matrícula','tipo','string')
        )
      ),
      'cartao_frota.alterado', jsonb_build_object(
        'label',    'Cartão de frota alterado',
        'modulo',   'Financeiro',
        'entidade', 'cartoes_frota',
        'campos', jsonb_build_array(
          jsonb_build_object('id','numero',       'label','Nº do cartão',        'tipo','string'),
          jsonb_build_object('id','tipo',         'label','Fornecedor (bp/repsol/edp)', 'tipo','string'),
          jsonb_build_object('id','status',       'label','Estado actual',       'tipo','string'),
          jsonb_build_object('id','alteracao',    'label','Tipo de alteração (titular/estado/plafond/dados)', 'tipo','string'),
          jsonb_build_object('id','titular_tipo', 'label','Titular actual (motorista/cliente/nenhum)', 'tipo','string')
        )
      ),
      'contrato.alterado', jsonb_build_object(
        'label',    'Contrato alterado',
        'modulo',   'Renting',
        'entidade', 'contratos',
        'campos', jsonb_build_array(
          jsonb_build_object('id','numero_contrato', 'label','Nº do contrato',   'tipo','number'),
          jsonb_build_object('id','status',          'label','Estado actual',    'tipo','string'),
          jsonb_build_object('id','alteracao',       'label','Tipo de alteração (estado/partes/datas/checks/dados)', 'tipo','string'),
          jsonb_build_object('id','motorista',       'label','Motorista',        'tipo','string'),
          jsonb_build_object('id','viatura',         'label','Matrícula',        'tipo','string'),
          jsonb_build_object('id','empresa',         'label','Empresa',          'tipo','string')
        )
      ),
      'lead.novo', jsonb_build_object(
        'label',    'Lead novo',
        'modulo',   'CRM',
        'entidade', 'leads_dasprent',
        'campos', jsonb_build_array(
          jsonb_build_object('id','zona',          'label','Zona',                    'tipo','string'),
          jsonb_build_object('id','tipo_viatura',  'label','Tipo de viatura',         'tipo','string'),
          jsonb_build_object('id','formulario',    'label','Formulário',              'tipo','string'),
          jsonb_build_object('id','formacao_tvde', 'label','Formação TVDE (sim/não)', 'tipo','string')
        )
      )
    ),
    'accoes', jsonb_build_object(
      'motorista.atualizar_campo', jsonb_build_object(
        'label',    'Preencher um campo do motorista',
        'modulo',   'Motoristas',
        'entidade', 'motoristas_ativos',
        'recurso',  'motoristas_editar',
        'campos_permitidos', jsonb_build_array('observacoes')
      ),
      'viatura.atualizar_campo', jsonb_build_object(
        'label',    'Preencher um campo da viatura',
        'modulo',   'Viaturas',
        'entidade', 'viaturas',
        'recurso',  'viaturas_editar',
        'campos_permitidos', jsonb_build_array('observacoes')
      ),
      'ticket.alterar_estado', jsonb_build_object(
        'label',    'Alterar o estado do ticket',
        'modulo',   'Assistência',
        'entidade', 'assistencia_tickets',
        'recurso',  'tickets_gerir',
        'valores', jsonb_build_array('pendente','aberto','em_andamento','aguardando','resolvido','fechado')
      )
    ),
    -- Fora de 'accoes' de propósito, ver 20260901120000.
    'notificacao_email', jsonb_build_object(
      'label',  'Enviar email',
      'modulo', 'Notificações'
    )
  );
$$;

notify pgrst, 'reload schema';
