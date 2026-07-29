-- Item 6/13 da lista do chefe: "Alerta IUC" (Imposto Único de Circulação).
-- Não existe nenhum mecanismo de IUC no sistema — mas o IUC é sempre
-- devido no MESMO MÊS/DIA da matrícula original, todos os anos, e
-- viaturas.data_matricula já existe (populada em 80% da frota
-- ativa/não vendida: 141/176). Não precisa de coluna nova — a próxima
-- data de IUC é sempre calculável a partir de data_matricula.
--
-- Lógica nova (não existia nenhum padrão de "data recorrente anual"
-- neste projeto): próxima_data_iuc = data_matricula + N anos, onde N é
-- o número de anos completos desde a matrícula + 1 (garante que é
-- sempre a PRÓXIMA ocorrência, nunca uma já passada). A aritmética de
-- intervalo do Postgres já trata bem o caso de 29 de fevereiro.

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
    v.org_id,
    'viatura.extintor_expirando',
    'viaturas',
    v.id,
    jsonb_build_object('extintor_validade', v.extintor_validade, 'matricula', v.matricula),
    'cron'
  from public.viaturas v
  where v.extintor_validade is not null
    and v.extintor_validade <= current_date + 15
    and (v.is_vendida is null or v.is_vendida = false)
    and coalesce(v.status, 'disponivel') <> 'inativo'
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'viaturas'
        and e.entity_id = v.id
        and e.event_type = 'viatura.extintor_expirando'
        and e.processed_at is null
    );

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    x.org_id,
    'viatura.iuc_a_pagar',
    'viaturas',
    x.id,
    jsonb_build_object('matricula', x.matricula, 'marca', x.marca, 'modelo', x.modelo, 'proxima_data_iuc', x.proxima_data_iuc),
    'cron'
  from (
    select
      v.id, v.org_id, v.matricula, v.marca, v.modelo,
      (v.data_matricula + make_interval(years => extract(year from age(current_date, v.data_matricula))::int + 1))::date as proxima_data_iuc
    from public.viaturas v
    where v.data_matricula is not null
      and (v.is_vendida is null or v.is_vendida = false)
      and coalesce(v.status, 'disponivel') <> 'inativo'
  ) x
  where x.proxima_data_iuc <= current_date + 15
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'viaturas'
        and e.entity_id = x.id
        and e.event_type = 'viatura.iuc_a_pagar'
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

-- Regra + template novos (seed_automacao_defaults).
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

-- Dual-write para a bell antiga.
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo = any (array[
  'motorista_pendente', 'escalonamento', 'viatura_disponivel', 'pedido_troca_kms', 'recibo_anulado',
  'viatura_seguro_expirando', 'viatura_inspecao_expirando', 'motorista_carta_expirando',
  'motorista_licenca_tvde_expirando', 'cobranca_gerada', 'utilizador_criado',
  'contrato_renting_renovacao_proxima', 'sistema_limite_email_atingido', 'sistema_job_falhou',
  'contrato_renting_criado', 'motorista_candidatura_parada', 'contrato_renting_sem_checkin',
  'viatura_extintor_expirando', 'viatura_iuc_a_pagar'
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
        'contrato_renting_sem_checkin', 'viatura_extintor_expirando', 'viatura_iuc_a_pagar'
      ])
      and destinatario_id = auth.uid()
    )
  )
);

-- execute_automation_runs(): mapeia o novo event_type (link já cobre
-- entity_table='viaturas' → /viaturas/<id>).
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
        else null
      end;

      v_viatura_id := case when v_run.entity_table = 'viaturas' then v_run.entity_id else null end;
      v_link := case v_run.entity_table
        when 'viaturas' then '/viaturas/' || v_run.entity_id::text
        when 'motoristas_ativos' then '/motoristas/' || v_run.entity_id::text
        when 'contratos_renting' then '/renting/contratos/' || v_run.entity_id::text
        when 'profiles' then '/admin/utilizadores'
        when 'motorista_candidaturas' then '/motoristas/candidaturas'
        else null
      end;

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
