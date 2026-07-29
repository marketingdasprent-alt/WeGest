-- Motor de Automação — C2 da auditoria: notificação proativa de renovação
-- de contrato_renting. O RenovacoesBanner já classifica corretamente
-- contratos "hoje"/"em atraso" para renovar, mas só é visto se o gestor
-- abrir a página de contratos de renting. Este scan diário replica a MESMA
-- regra em SQL, reaproveitando public.proxima_data_renovacao() — a mesma
-- função já usada por renovar_contrato_renting() — em vez de duplicar a
-- lógica de datas.

-- 1. Emissor do evento.
create or replace function public.emit_contrato_renting_renovacao_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    x.org_id,
    'contrato_renting.renovacao_proxima',
    'contratos_renting',
    x.id,
    jsonb_build_object('codigo', x.codigo, 'matricula', x.matricula, 'cliente_nome', x.cliente_nome, 'prazo', x.prazo),
    'cron'
  from (
    select
      c.id, c.org_id, c.codigo, c.matricula, cl.nome as cliente_nome,
      coalesce(
        c.data_fim,
        public.proxima_data_renovacao(c.data_inicio, c.renovacao_opcao::text, c.renovacao_intervalo_dias)
      )::date as prazo
    from public.contratos_renting c
    join public.clientes cl on cl.id = c.cliente_id
    where c.regime in ('rent_a_car', 'tvde')
      and coalesce(c.is_longa_duracao, false) = true
      and c.substituido_em is null
      and c.deleted_at is null
      and c.estado_operacional = 'em_curso'
      and (c.data_fim is not null or c.regime = 'tvde')
  ) x
  where x.prazo is not null
    and x.prazo <= current_date
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'contratos_renting'
        and e.entity_id = x.id
        and e.event_type = 'contrato_renting.renovacao_proxima'
        and e.processed_at is null
    );
end;
$$;

revoke all on function public.emit_contrato_renting_renovacao_events() from public, anon, authenticated;
grant execute on function public.emit_contrato_renting_renovacao_events() to service_role;

select cron.schedule(
  'automation-emit-renovacao-contratos-diario',
  '0 8 * * *',
  $$select public.emit_contrato_renting_renovacao_events()$$
);

-- 2. seed_automacao_defaults(): nova regra + template de email.
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
    ),
    (
      p_org_id, 'utilizador.criado', 'Novo utilizador criado', 'utilizador.criado', 'notificacao',
      jsonb_build_object('template_codigo', 'utilizador.criado', 'destinatarios_recurso', 'admin_utilizadores', 'enviar_email', false, 'titulo', 'Novo utilizador criado'),
      0
    ),
    (
      p_org_id, 'contrato_renting.renovacao_proxima', 'Contrato de renting a atingir data de renovação', 'contrato_renting.renovacao_proxima', 'notificacao',
      jsonb_build_object('template_codigo', 'contrato_renting.renovacao_proxima', 'destinatarios_recurso', 'renting_contratos', 'enviar_email', true, 'titulo', 'Contrato a renovar'),
      1440
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
    ),
    (
      p_org_id, 'contrato_renting.renovacao_proxima', 'email', 'pt-PT',
      'Contrato {{codigo}} ({{matricula}}) a atingir a data de renovação',
      'O contrato de renting nº {{codigo}} de {{cliente_nome}} (viatura {{matricula}}) atinge a data de renovação em {{prazo}}. Confirma se a renovação já foi preparada.',
      'text', array['codigo', 'matricula', 'cliente_nome', 'prazo']
    )
  on conflict (codigo, canal, idioma, versao, org_id) do nothing;
end;
$$;

-- 3. Backfill: toda organização existente ganha a regra e o template novos.
do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizacoes loop
    perform public.seed_automacao_defaults(v_org.id);
  end loop;
end;
$$;
