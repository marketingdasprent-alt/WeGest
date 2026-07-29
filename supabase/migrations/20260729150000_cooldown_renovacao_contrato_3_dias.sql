-- Pedido do utilizador (29/07): o alerta "Contrato a renovar"
-- (contrato_renting.renovacao_proxima) reemite um domain_event por dia
-- para cada contrato em atraso de renovação (emit_contrato_renting_
-- renovacao_events roda diariamente e não tem janela superior — ver
-- 20260727290000). Com cooldown_minutos=1440 (24h), isso significa um
-- toast novo por dia por contrato, indefinidamente até alguém tratar o
-- contrato. Sobe o cooldown para 4320 min (3 dias): mesmo contrato só
-- volta a notificar de 3 em 3 dias enquanto continuar por renovar.

update public.automation_rules
set cooldown_minutos = 4320
where event_type = 'contrato_renting.renovacao_proxima';

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
      jsonb_build_object('template_codigo', 'viatura.seguro_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'enviar_email_digest', true, 'titulo', 'Seguro de viatura a expirar'),
      1440
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'Inspeção periódica (IPO) a expirar', 'viatura.inspecao_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.inspecao_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'enviar_email_digest', true, 'titulo', 'Inspeção periódica (IPO) a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'Carta de condução do motorista a expirar', 'motorista.carta_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.carta_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'enviar_email_digest', true, 'titulo', 'Carta de condução do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'Licença TVDE do motorista a expirar', 'motorista.licenca_tvde_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.licenca_tvde_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'enviar_email_digest', true, 'titulo', 'Licença TVDE do motorista a expirar'),
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
      4320
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
      jsonb_build_object('template_codigo', 'viatura.extintor_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'enviar_email_digest', true, 'titulo', 'Extintor a expirar'),
      1440
    ),
    (
      p_org_id, 'viatura.iuc_a_pagar', 'IUC da viatura a pagar', 'viatura.iuc_a_pagar', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.iuc_a_pagar', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'enviar_email_digest', true, 'titulo', 'IUC a pagar'),
      1440
    ),
    (
      p_org_id, 'viatura.manutencao_preventiva_expirando', 'Plano de manutenção preventiva a aproximar-se', 'viatura.manutencao_preventiva_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.manutencao_preventiva_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'enviar_email_digest', true, 'titulo', 'Manutenção preventiva a aproximar-se'),
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
    ),
    (
      p_org_id, 'seguranca.login_suspeito', 'Tentativas de login suspeitas', 'seguranca.login_suspeito', 'notificacao',
      jsonb_build_object('template_codigo', 'seguranca.login_suspeito', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', '[]'::jsonb, 'enviar_email', true, 'titulo', 'Tentativas de login suspeitas detetadas'),
      15
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
    ),
    (
      p_org_id, 'seguranca.login_suspeito', 'email', 'pt-PT',
      'Tentativas de login suspeitas para {{email}}',
      'Foram detetadas {{tentativas}} tentativas de login falhadas para {{email}} nos últimos {{janela_minutos}} minutos. Se não reconheces esta atividade, considera repor a palavra-passe deste utilizador.',
      'text', array['email', 'tentativas', 'janela_minutos']
    )
  on conflict (codigo, canal, idioma, versao, org_id) do nothing;
end;
$$;
