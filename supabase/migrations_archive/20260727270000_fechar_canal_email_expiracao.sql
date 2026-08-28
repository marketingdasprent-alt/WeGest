-- Motor de Automação — fecha o canal email do MVP (E1/E2/G1 da Fase 1).
-- send-notification-queue-email já lia notification_templates e escrevia
-- notification_delivery desde o início, mas nenhuma linha de
-- notification_templates existia e as 4 regras de expiração (seguro, IPO,
-- carta, licença TVDE) tinham enviar_email=false — a arquitetura da Fase 2
-- pedia email para estas (E1/E2/G1), ao contrário de cobranca.gerada
-- (I1/I2), onde o utilizador decidiu explicitamente não automatizar o
-- envio. Essa decisão não é tocada aqui.

-- 1. emit_expiry_events(): incluir o nome do motorista no payload dos dois
--    eventos de motorista — sem isto, nem a notificação interna nem o
--    email dizem QUEM está com a carta/licença a expirar.
create or replace function public.emit_expiry_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    v.org_id,
    'viatura.seguro_expirando',
    'viaturas',
    v.id,
    jsonb_build_object('seguro_validade', v.seguro_validade, 'matricula', v.matricula),
    'cron'
  from public.viaturas v
  where v.seguro_validade is not null
    and v.seguro_validade <= current_date + 15
    and (v.is_vendida is null or v.is_vendida = false)
    and coalesce(v.status, 'disponivel') <> 'inativo'
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'viaturas'
        and e.entity_id = v.id
        and e.event_type = 'viatura.seguro_expirando'
        and e.processed_at is null
    );

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    v.org_id,
    'viatura.inspecao_expirando',
    'viaturas',
    v.id,
    jsonb_build_object('inspecao_validade', v.inspecao_validade, 'matricula', v.matricula),
    'cron'
  from public.viaturas v
  where v.inspecao_validade is not null
    and v.inspecao_validade <= current_date + 15
    and (v.is_vendida is null or v.is_vendida = false)
    and coalesce(v.status, 'disponivel') <> 'inativo'
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'viaturas'
        and e.entity_id = v.id
        and e.event_type = 'viatura.inspecao_expirando'
        and e.processed_at is null
    );

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    m.org_id,
    'motorista.carta_expirando',
    'motoristas_ativos',
    m.id,
    jsonb_build_object('carta_validade', m.carta_validade, 'nome', m.nome),
    'cron'
  from public.motoristas_ativos m
  where m.carta_validade is not null
    and m.carta_validade <= current_date + 15
    and coalesce(m.status_ativo, true) = true
    and m.org_id is not null
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'motoristas_ativos'
        and e.entity_id = m.id
        and e.event_type = 'motorista.carta_expirando'
        and e.processed_at is null
    );

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    m.org_id,
    'motorista.licenca_tvde_expirando',
    'motoristas_ativos',
    m.id,
    jsonb_build_object('licenca_tvde_validade', m.licenca_tvde_validade, 'nome', m.nome),
    'cron'
  from public.motoristas_ativos m
  where m.licenca_tvde_validade is not null
    and m.licenca_tvde_validade <= current_date + 15
    and coalesce(m.status_ativo, true) = true
    and m.org_id is not null
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'motoristas_ativos'
        and e.entity_id = m.id
        and e.event_type = 'motorista.licenca_tvde_expirando'
        and e.processed_at is null
    );
end;
$$;

revoke all on function public.emit_expiry_events() from public, anon, authenticated;
grant execute on function public.emit_expiry_events() to service_role;

-- 2. seed_automacao_defaults(): as 4 regras de expiração passam a
--    enviar_email=true (cobranca.gerada fica intocada), e cada org ganha
--    um template de email por codigo de expiração.
create or replace function public.seed_automacao_defaults(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config, cooldown_minutos)
  values
    (
      p_org_id, 'viatura.seguro_expirando', 'Seguro de viatura a expirar', 'viatura.seguro_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.seguro_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Seguro de viatura a expirar'),
      1440
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'Inspeção periódica (IPO) a expirar', 'viatura.inspecao_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.inspecao_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Inspeção periódica (IPO) a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'Carta de condução do motorista a expirar', 'motorista.carta_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.carta_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Carta de condução do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'Licença TVDE do motorista a expirar', 'motorista.licenca_tvde_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.licenca_tvde_expirando', 'destinatarios_estrategia', 'gestor_responsavel', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', true, 'titulo', 'Licença TVDE do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'cobranca.gerada', 'Nova cobrança gerada — pronta a emitir', 'cobranca.gerada', 'notificacao',
      jsonb_build_object('template_codigo', 'cobranca.gerada', 'destinatarios_recurso', 'renting_contratos', 'enviar_email', false, 'titulo', 'Nova cobrança gerada'),
      0
    )
  on conflict (codigo, org_id) do nothing;

  insert into public.notification_templates (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, variaveis_esperadas)
  values
    (
      p_org_id, 'viatura.seguro_expirando', 'email', 'pt-PT',
      'Seguro da viatura {{matricula}} a expirar',
      'O seguro da viatura {{matricula}} expira em {{seguro_validade}}. Confirma se a renovação já está tratada.',
      'text', array['matricula', 'seguro_validade']
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'email', 'pt-PT',
      'Inspeção periódica (IPO) da viatura {{matricula}} a expirar',
      'A inspeção periódica (IPO) da viatura {{matricula}} expira em {{inspecao_validade}}. Agenda a inspeção antes da data.',
      'text', array['matricula', 'inspecao_validade']
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'email', 'pt-PT',
      'Carta de condução de {{nome}} a expirar',
      'A carta de condução de {{nome}} expira em {{carta_validade}}. Confirma que a renovação está a ser tratada antes de atribuir novos contratos.',
      'text', array['nome', 'carta_validade']
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'email', 'pt-PT',
      'Licença TVDE de {{nome}} a expirar',
      'A licença TVDE de {{nome}} expira em {{licenca_tvde_validade}}. Confirma que a renovação está a ser tratada antes de atribuir novos contratos.',
      'text', array['nome', 'licenca_tvde_validade']
    )
  on conflict (codigo, canal, idioma, versao, org_id) do nothing;
end;
$$;

-- 3. Backfill para organizações já existentes:
--    a) regras já seedadas não são recriadas pelo ON CONFLICT acima —
--       ligar enviar_email explicitamente nas 4 de expiração.
update public.automation_rules
set acao_config = jsonb_set(acao_config, '{enviar_email}', 'true'::jsonb)
where event_type in ('viatura.seguro_expirando', 'viatura.inspecao_expirando', 'motorista.carta_expirando', 'motorista.licenca_tvde_expirando')
  and coalesce((acao_config->>'enviar_email')::boolean, false) = false;

--    b) reaplicar o seed a toda organização existente: as regras não
--       duplicam (ON CONFLICT), os templates de email são novos e entram.
do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizacoes loop
    perform public.seed_automacao_defaults(v_org.id);
  end loop;
end;
$$;
