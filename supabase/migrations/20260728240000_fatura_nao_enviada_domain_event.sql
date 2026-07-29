-- Item 11/13 da lista do chefe: "Envio de fatura ao cliente".
-- IMPORTANTE: não automatiza emissão nem envio de documentos fiscais —
-- decisão já tomada anteriormente ("essa parte da emitir documentos
-- fiscais e etc não é uma boa ideia, deixa isso pro pessoal fazer
-- manualmente"). O gap real encontrado: uma fatura pode ficar
-- status='emitida' sem NUNCA ter sido enviada por email ao cliente
-- (ação manual separada, sem nenhum rasto na BD até agora). Este item
-- adiciona só esse rasto (invoices.enviado_em, preenchido pelo
-- frontend em src/lib/emailDocumentoFiscal.ts) e um lembrete INTERNO
-- ao staff — nunca um envio automático ao cliente.

alter table public.invoices
  add column if not exists enviado_em timestamptz;

create or replace function public.emit_faturas_nao_enviadas_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    i.org_id,
    'invoice.nao_enviada_ao_cliente',
    'invoices',
    i.id,
    jsonb_build_object(
      'numero', i.numero,
      'total', i.total,
      'cliente_nif', i.cliente_nif,
      'data_emissao', i.data_emissao,
      'contrato_id', i.contrato_id
    ),
    'cron'
  from public.invoices i
  where i.status = 'emitida'
    and i.enviado_em is null
    and i.org_id is not null
    and i.created_at <= now() - interval '3 days'
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'invoices'
        and e.entity_id = i.id
        and e.event_type = 'invoice.nao_enviada_ao_cliente'
        and e.processed_at is null
    );
end;
$$;

revoke all on function public.emit_faturas_nao_enviadas_events() from public, anon, authenticated;
grant execute on function public.emit_faturas_nao_enviadas_events() to service_role;

select cron.schedule(
  'automation-emit-faturas-nao-enviadas-diario',
  '0 8 * * *',
  $$select public.emit_faturas_nao_enviadas_events()$$
);

create or replace function public.seed_automacao_defaults(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cargo_gestor_tvde jsonb;
begin
  select coalesce(jsonb_agg(c.id), '[]'::jsonb)
  into v_cargo_gestor_tvde
  from public.cargos c
  where c.org_id = p_org_id and c.nome ilike 'gestor tvde';

  insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config, cooldown_minutos)
  values
    (
      p_org_id, 'viatura.seguro_expirando', 'Seguro de viatura a expirar', 'viatura.seguro_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.seguro_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Seguro de viatura a expirar'),
      1440
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'Inspeção periódica (IPO) a expirar', 'viatura.inspecao_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.inspecao_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Inspeção periódica (IPO) a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'Carta de condução do motorista a expirar', 'motorista.carta_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.carta_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Carta de condução do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'Licença TVDE do motorista a expirar', 'motorista.licenca_tvde_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.licenca_tvde_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Licença TVDE do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'cobranca.gerada', 'Nova cobrança gerada — pronta a emitir', 'cobranca.gerada', 'notificacao',
      jsonb_build_object('template_codigo', 'cobranca.gerada', 'destinatarios_estrategia', 'cargo', 'enviar_email', false, 'titulo', 'Nova cobrança gerada'),
      0
    ),
    (
      p_org_id, 'utilizador.criado', 'Novo utilizador criado', 'utilizador.criado', 'notificacao',
      jsonb_build_object('template_codigo', 'utilizador.criado', 'destinatarios_estrategia', 'cargo', 'enviar_email', false, 'titulo', 'Novo utilizador criado'),
      0
    ),
    (
      p_org_id, 'contrato_renting.renovacao_proxima', 'Contrato de renting a atingir data de renovação', 'contrato_renting.renovacao_proxima', 'notificacao',
      jsonb_build_object('template_codigo', 'contrato_renting.renovacao_proxima', 'destinatarios_estrategia', 'cargo', 'enviar_email', true, 'enviar_email_digest', true, 'titulo', 'Contrato a renovar'),
      1440
    ),
    (
      p_org_id, 'contrato_renting.criado', 'Contrato de Aluguer criado', 'contrato_renting.criado', 'notificacao',
      jsonb_build_object('template_codigo', 'contrato_renting.criado', 'destinatarios_estrategia', 'cargo', 'enviar_email', false, 'titulo', 'Novo contrato de aluguer'),
      0
    ),
    (
      p_org_id, 'motorista.candidatura_parada', 'Candidatura de motorista parada para aceitar', 'motorista.candidatura_parada', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.candidatura_parada', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Candidatura parada'),
      1440
    ),
    (
      p_org_id, 'contrato_renting.sem_checkin', 'Reservas sem Checkin (devolução)', 'contrato_renting.sem_checkin', 'notificacao',
      jsonb_build_object('template_codigo', 'contrato_renting.sem_checkin', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Devolução em atraso'),
      1440
    ),
    (
      p_org_id, 'viatura.extintor_expirando', 'Extintor da viatura a expirar', 'viatura.extintor_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.extintor_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Extintor a expirar'),
      1440
    ),
    (
      p_org_id, 'viatura.iuc_a_pagar', 'IUC da viatura a pagar', 'viatura.iuc_a_pagar', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.iuc_a_pagar', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'IUC a pagar'),
      1440
    ),
    (
      p_org_id, 'viatura.manutencao_preventiva_expirando', 'Plano de manutenção preventiva a aproximar-se', 'viatura.manutencao_preventiva_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.manutencao_preventiva_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Manutenção preventiva a aproximar-se'),
      1440
    ),
    (
      p_org_id, 'motorista.reparacao_cobranca', 'Reparação fechada com valor a cobrar ao motorista', 'motorista.reparacao_cobranca', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.reparacao_cobranca', 'destinatarios_estrategia', 'motorista', 'enviar_email', true, 'titulo', 'Tens uma reparação com valor a pagar'),
      0
    ),
    (
      p_org_id, 'assistencia_ticket.aberto_demasiado_tempo', 'Ticket de assistência aberto há demasiado tempo', 'assistencia_ticket.aberto_demasiado_tempo', 'notificacao',
      jsonb_build_object('template_codigo', 'assistencia_ticket.aberto_demasiado_tempo', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Ticket aberto há demasiado tempo'),
      1440
    ),
    (
      p_org_id, 'motorista.ficha_incompleta', 'Ficha do motorista incompleta', 'motorista.ficha_incompleta', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.ficha_incompleta', 'destinatarios_estrategia', 'motorista', 'enviar_email', true, 'titulo', 'Falta completares a tua ficha'),
      1440
    ),
    (
      p_org_id, 'invoice.nao_enviada_ao_cliente', 'Fatura emitida sem ser enviada ao cliente', 'invoice.nao_enviada_ao_cliente', 'notificacao',
      jsonb_build_object('template_codigo', 'invoice.nao_enviada_ao_cliente', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Fatura por enviar ao cliente'),
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
    ),
    (
      p_org_id, 'digest.resumo_diario', 'email', 'pt-PT',
      'Resumo diário — {{total}} aviso(s) novo(s)',
      'Tens {{total}} aviso(s) novo(s) hoje:<br><br>{{lista}}',
      'html', array['total', 'lista']
    ),
    (
      p_org_id, 'sistema.job_falhou', 'email', 'pt-PT',
      'Falha num job agendado ({{job_type}})',
      'Um job agendado falhou definitivamente (fonte: {{source_table}}, tipo: {{job_type}}).<br><br>Erro: {{last_error}}<br><br>Ver detalhes em Automação → Falhas.',
      'html', array['source_table', 'job_type', 'last_error']
    ),
    (
      p_org_id, 'contrato_renting.criado', 'email', 'pt-PT',
      'Novo contrato {{codigo}} ({{matricula}}) — {{cliente_nome}}',
      'Foi criado o contrato nº {{codigo}} ({{regime}}) com {{cliente_nome}}, viatura {{matricula}}, a começar em {{data_inicio}}.',
      'text', array['codigo', 'matricula', 'cliente_nome', 'regime', 'data_inicio']
    ),
    (
      p_org_id, 'motorista.candidatura_parada', 'email', 'pt-PT',
      'Candidatura de {{nome}} parada há mais de 3 dias',
      'A candidatura de {{nome}} ({{email}}) está em "{{status}}" desde {{data_submissao}}, sem decisão final. Confirma se já foi tratada.',
      'text', array['nome', 'email', 'status', 'data_submissao']
    ),
    (
      p_org_id, 'contrato_renting.sem_checkin', 'email', 'pt-PT',
      'Devolução em atraso — contrato {{codigo}} ({{matricula}})',
      'O contrato nº {{codigo}} de {{cliente_nome}} (viatura {{matricula}}) devia ter sido devolvido em {{data_fim}} e ainda não há check-in registado.',
      'text', array['codigo', 'matricula', 'cliente_nome', 'data_fim']
    ),
    (
      p_org_id, 'viatura.extintor_expirando', 'email', 'pt-PT',
      'Extintor da viatura {{matricula}} a expirar',
      'O extintor da viatura {{matricula}} expira em {{extintor_validade}}. Confirma se a substituição já está tratada.',
      'text', array['matricula', 'extintor_validade']
    ),
    (
      p_org_id, 'viatura.iuc_a_pagar', 'email', 'pt-PT',
      'IUC da viatura {{matricula}} a pagar',
      'O IUC da viatura {{matricula}} ({{marca}} {{modelo}}) vence em {{proxima_data_iuc}}. Confirma se o pagamento já está preparado.',
      'text', array['matricula', 'marca', 'modelo', 'proxima_data_iuc']
    ),
    (
      p_org_id, 'viatura.manutencao_preventiva_expirando', 'email', 'pt-PT',
      'Manutenção preventiva da viatura {{matricula}} a aproximar-se',
      'A viatura {{matricula}} está a aproximar-se da próxima manutenção preventiva (data: {{proxima_manutencao_data}}, km: {{proxima_manutencao_km}} — km atual: {{km_atual}}). Agenda a revisão.',
      'text', array['matricula', 'proxima_manutencao_data', 'proxima_manutencao_km', 'km_atual']
    ),
    (
      p_org_id, 'motorista.reparacao_cobranca', 'email', 'pt-PT',
      'Reparação da viatura {{matricula}} — tens {{valor}}€ a pagar',
      'A reparação "{{descricao}}" da viatura {{matricula}} ficou concluída com um valor de {{valor}}€ a teu cargo. Consulta o teu extrato financeiro para mais detalhes.',
      'text', array['matricula', 'valor', 'descricao']
    ),
    (
      p_org_id, 'assistencia_ticket.aberto_demasiado_tempo', 'email', 'pt-PT',
      'Ticket #{{numero}} ({{matricula}}) aberto há mais de 7 dias',
      'O ticket #{{numero}} "{{titulo}}" (viatura {{matricula}}, prioridade {{prioridade}}) está em "{{status}}" desde {{criado_em}}, há mais de 7 dias sem resolução. Confirma o ponto de situação.',
      'text', array['numero', 'titulo', 'matricula', 'prioridade', 'status', 'criado_em']
    ),
    (
      p_org_id, 'motorista.ficha_incompleta', 'email', 'pt-PT',
      'Falta completares a tua ficha, {{nome}}',
      'Olá {{nome}}, a tua ficha ainda tem dados em falta: {{campos_em_falta}}. Conclui o preenchimento no teu perfil para evitar bloqueios em contratos e pagamentos.',
      'text', array['nome', 'campos_em_falta']
    ),
    (
      p_org_id, 'invoice.nao_enviada_ao_cliente', 'email', 'pt-PT',
      'Fatura {{numero}} emitida há mais de 3 dias sem ser enviada',
      'A fatura {{numero}} (total {{total}}€, NIF {{cliente_nif}}, emitida em {{data_emissao}}) ainda não foi enviada ao cliente. Confirma o envio manualmente em Renting → Contrato → Faturar.',
      'text', array['numero', 'total', 'cliente_nif', 'data_emissao']
    )
  on conflict (codigo, canal, idioma, versao, org_id) do nothing;
end;
$$;

do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizacoes loop
    perform public.seed_automacao_defaults(v_org.id);
  end loop;
end;
$$;

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo = any (array[
  'motorista_pendente', 'escalonamento', 'viatura_disponivel', 'pedido_troca_kms', 'recibo_anulado',
  'viatura_seguro_expirando', 'viatura_inspecao_expirando', 'motorista_carta_expirando',
  'motorista_licenca_tvde_expirando', 'cobranca_gerada', 'utilizador_criado',
  'contrato_renting_renovacao_proxima', 'sistema_limite_email_atingido', 'sistema_job_falhou',
  'contrato_renting_criado', 'motorista_candidatura_parada', 'contrato_renting_sem_checkin',
  'viatura_extintor_expirando', 'viatura_iuc_a_pagar', 'viatura_manutencao_preventiva_expirando',
  'motorista_reparacao_cobranca', 'assistencia_ticket_aberto_demasiado_tempo',
  'motorista_ficha_incompleta', 'invoice_nao_enviada_ao_cliente'
]));

drop policy if exists "ver notificacoes do meu cargo" on public.notificacoes;
create policy "ver notificacoes do meu cargo" on public.notificacoes
for select using (
  (org_id is null or org_id = get_current_org_id())
  and (
    (tipo = 'motorista_pendente' and (is_current_user_admin() or current_user_cargo() = any (array['Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE'])))
    or (tipo = any (array['escalonamento', 'pedido_troca_kms']) and (is_current_user_admin() or current_user_cargo() = 'Supervisor Gestor TVDE'))
    or (
      tipo = any (array[
        'viatura_disponivel', 'recibo_anulado', 'viatura_seguro_expirando',
        'viatura_inspecao_expirando', 'motorista_carta_expirando',
        'motorista_licenca_tvde_expirando', 'cobranca_gerada', 'utilizador_criado',
        'contrato_renting_renovacao_proxima', 'sistema_limite_email_atingido',
        'sistema_job_falhou', 'contrato_renting_criado', 'motorista_candidatura_parada',
        'contrato_renting_sem_checkin', 'viatura_extintor_expirando', 'viatura_iuc_a_pagar',
        'viatura_manutencao_preventiva_expirando', 'motorista_reparacao_cobranca',
        'assistencia_ticket_aberto_demasiado_tempo', 'motorista_ficha_incompleta',
        'invoice_nao_enviada_ao_cliente'
      ])
      and destinatario_id = auth.uid()
    )
  )
);

create or replace function public.execute_automation_runs(p_max integer default 20)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.automation_runs;
  v_rule public.automation_rules;
  v_destinatario record;
  v_notification_id uuid;
  v_cargo_ids uuid[];
  v_user_ids uuid[];
  v_modo text;
  v_enviar_email boolean;
  v_enviar_email_digest boolean;
  v_estrategia text;
  v_gestor_nome text;
  v_gestor_user_id uuid;
  v_notif_count integer;
  v_email_count integer;
  v_tipo_legado text;
  v_link text;
  v_viatura_id uuid;
  v_driver_motorista_id uuid;
  v_driver_user_id uuid;
  v_driver_email text;
begin
  for v_run in select * from public.automation_runs_claim(p_max)
  loop
    begin
      select * into v_rule from public.automation_rules where id = v_run.rule_id;

      if v_rule.acao_tipo <> 'notificacao' then
        perform public.automation_runs_complete(v_run.id);
        continue;
      end if;

      v_cargo_ids := array(
        select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_cargo_ids', '[]'::jsonb))::uuid
      );
      v_user_ids := array(
        select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_user_ids', '[]'::jsonb))::uuid
      );
      v_modo := coalesce(v_rule.acao_config->>'destinatarios_modo', 'grupo');
      v_enviar_email := coalesce((v_rule.acao_config->>'enviar_email')::boolean, false);
      v_enviar_email_digest := coalesce((v_rule.acao_config->>'enviar_email_digest')::boolean, false);
      v_estrategia := coalesce(v_rule.acao_config->>'destinatarios_estrategia', 'cargo');
      v_gestor_nome := null;
      v_gestor_user_id := null;
      v_driver_motorista_id := null;
      v_driver_user_id := null;
      v_driver_email := null;
      v_notif_count := 0;
      v_email_count := 0;

      v_tipo_legado := case v_rule.event_type
        when 'viatura.seguro_expirando' then 'viatura_seguro_expirando'
        when 'viatura.inspecao_expirando' then 'viatura_inspecao_expirando'
        when 'motorista.carta_expirando' then 'motorista_carta_expirando'
        when 'motorista.licenca_tvde_expirando' then 'motorista_licenca_tvde_expirando'
        when 'cobranca.gerada' then 'cobranca_gerada'
        when 'utilizador.criado' then 'utilizador_criado'
        when 'contrato_renting.renovacao_proxima' then 'contrato_renting_renovacao_proxima'
        when 'contrato_renting.criado' then 'contrato_renting_criado'
        when 'motorista.candidatura_parada' then 'motorista_candidatura_parada'
        when 'contrato_renting.sem_checkin' then 'contrato_renting_sem_checkin'
        when 'viatura.extintor_expirando' then 'viatura_extintor_expirando'
        when 'viatura.iuc_a_pagar' then 'viatura_iuc_a_pagar'
        when 'viatura.manutencao_preventiva_expirando' then 'viatura_manutencao_preventiva_expirando'
        when 'motorista.reparacao_cobranca' then 'motorista_reparacao_cobranca'
        when 'assistencia_ticket.aberto_demasiado_tempo' then 'assistencia_ticket_aberto_demasiado_tempo'
        when 'motorista.ficha_incompleta' then 'motorista_ficha_incompleta'
        when 'invoice.nao_enviada_ao_cliente' then 'invoice_nao_enviada_ao_cliente'
        else null
      end;

      v_viatura_id := case when v_run.entity_table = 'viaturas' then v_run.entity_id else null end;
      v_link := case v_run.entity_table
        when 'viaturas' then '/viaturas/' || v_run.entity_id::text
        when 'motoristas_ativos' then '/motoristas/' || v_run.entity_id::text
        when 'contratos_renting' then '/renting/contratos/' || v_run.entity_id::text
        when 'profiles' then '/admin/utilizadores'
        when 'motorista_candidaturas' then '/motoristas/candidaturas'
        when 'assistencia_tickets' then '/assistencia/' || v_run.entity_id::text
        else null
      end;

      if v_estrategia = 'motorista' then
        if v_run.entity_table = 'motorista_financeiro' then
          select mf.motorista_id, ma.user_id, ma.email
          into v_driver_motorista_id, v_driver_user_id, v_driver_email
          from public.motorista_financeiro mf
          join public.motoristas_ativos ma on ma.id = mf.motorista_id
          where mf.id = v_run.entity_id;
        elsif v_run.entity_table = 'motoristas_ativos' then
          select ma.id, ma.user_id, ma.email
          into v_driver_motorista_id, v_driver_user_id, v_driver_email
          from public.motoristas_ativos ma
          where ma.id = v_run.entity_id;
        end if;

        v_link := case when v_driver_motorista_id is not null then '/motoristas/' || v_driver_motorista_id::text else null end;

        if v_driver_user_id is not null then
          insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo, payload, entity_table, entity_id, rule_run_id)
          values (
            v_run.org_id,
            v_driver_user_id,
            v_rule.acao_config->>'template_codigo',
            coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
            v_run.payload,
            v_run.entity_table,
            v_run.entity_id,
            v_run.id
          )
          returning id into v_notification_id;
          v_notif_count := v_notif_count + 1;

          if v_tipo_legado is not null then
            insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade, destinatario_id, link, viatura_id)
            values (
              v_run.org_id,
              v_tipo_legado,
              coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
              null,
              'normal',
              v_driver_user_id,
              v_link,
              v_viatura_id
            );
          end if;
        end if;

        if v_enviar_email and v_driver_email is not null then
          insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
          values (v_notification_id, v_run.org_id, 'email', v_driver_email, v_rule.acao_config->>'template_codigo', v_run.payload);
          v_email_count := v_email_count + 1;
        end if;

        perform public.automation_runs_complete(
          v_run.id,
          jsonb_build_object('notificacoes_criadas', v_notif_count, 'emails_enviados', v_email_count)
        );
        continue;
      end if;

      if v_estrategia = 'gestor_responsavel' then
        if v_run.entity_table = 'motoristas_ativos' then
          select m.gestor_responsavel into v_gestor_nome
          from public.motoristas_ativos m
          where m.id = v_run.entity_id;
        elsif v_run.entity_table = 'viaturas' then
          select m.gestor_responsavel into v_gestor_nome
          from public.motorista_viaturas mv
          join public.motoristas_ativos m on m.id = mv.motorista_id
          where mv.viatura_id = v_run.entity_id
            and mv.status = 'ativo'
            and mv.data_fim is null
          limit 1;
        end if;

        if v_gestor_nome is not null and btrim(v_gestor_nome) <> '' then
          select p.id into v_gestor_user_id
          from public.profiles p
          where lower(btrim(p.nome)) = lower(btrim(v_gestor_nome))
            and p.org_id = v_run.org_id
          limit 1;
        end if;
      end if;

      for v_destinatario in
        select u.id as user_id, u.email
        from auth.users u
        where (
          v_gestor_user_id is not null and u.id = v_gestor_user_id
        ) or (
          v_gestor_user_id is null and u.id in (
            select uo.user_id
            from public.user_organizacoes uo
            where uo.org_id = v_run.org_id
              and (
                uo.is_admin = true
                or (
                  v_estrategia = 'cargo'
                  and uo.cargo_id is not null
                  and (
                    (v_modo = 'individual' and uo.user_id = any(v_user_ids))
                    or (v_modo <> 'individual' and uo.cargo_id = any(v_cargo_ids))
                  )
                )
              )
          )
        )
      loop
        insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo, payload, entity_table, entity_id, rule_run_id)
        values (
          v_run.org_id,
          v_destinatario.user_id,
          v_rule.acao_config->>'template_codigo',
          coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
          v_run.payload,
          v_run.entity_table,
          v_run.entity_id,
          v_run.id
        )
        returning id into v_notification_id;
        v_notif_count := v_notif_count + 1;

        if v_tipo_legado is not null then
          insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade, destinatario_id, link, viatura_id)
          values (
            v_run.org_id,
            v_tipo_legado,
            coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
            null,
            'normal',
            v_destinatario.user_id,
            v_link,
            v_viatura_id
          );
        end if;

        if v_enviar_email and not v_enviar_email_digest and v_destinatario.email is not null then
          insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
          values (v_notification_id, v_run.org_id, 'email', v_destinatario.email, v_rule.acao_config->>'template_codigo', v_run.payload);
          v_email_count := v_email_count + 1;
        end if;
      end loop;

      perform public.automation_runs_complete(
        v_run.id,
        jsonb_build_object('notificacoes_criadas', v_notif_count, 'emails_enviados', v_email_count)
      );
    exception when others then
      perform public.automation_runs_fail(v_run.id, sqlerrm);
    end;
  end loop;
end;
$$;

revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;
