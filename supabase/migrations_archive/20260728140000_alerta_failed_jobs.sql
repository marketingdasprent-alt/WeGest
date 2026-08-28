-- Motor genérico de alerta em falha de jobs agendados (MVP): fecha o
-- buraco em que a tabela failed_jobs (motor de automação + fila de
-- notificações) já existia mas ninguém era avisado — só um ecrã que o
-- admin tinha de ir espreitar de 30 em 30 segundos. Sync do Bolt/Uber/
-- Repsol/EDP e Via Verde ficam fora deste MVP (item separado da lista).
--
-- Segue o mesmo padrão já usado para "sistema.limite_email_atingido":
-- aviso direto aos admins da org, sem passar pelo motor de
-- regras/cargo (é um alerta técnico, não configurável por grupo).

-- 0) notificacoes.tipo tinha um CHECK que nunca chegou a incluir
--    'sistema_limite_email_atingido' (migração 20260728110000) nem, agora,
--    'sistema_job_falhou' — sem isto, qualquer INSERT com estes tipos
--    falha com "violates check constraint".
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo = any (array[
  'motorista_pendente', 'escalonamento', 'viatura_disponivel', 'pedido_troca_kms', 'recibo_anulado',
  'viatura_seguro_expirando', 'viatura_inspecao_expirando', 'motorista_carta_expirando',
  'motorista_licenca_tvde_expirando', 'cobranca_gerada', 'utilizador_criado',
  'contrato_renting_renovacao_proxima', 'sistema_limite_email_atingido', 'sistema_job_falhou'
]));

-- 1) Trigger: por cada INSERT em failed_jobs, avisa os admins da org.
create or replace function public.handle_failed_job_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
  v_notification_id uuid;
begin
  for v_admin in
    select u.id as user_id, u.email
    from auth.users u
    join public.user_organizacoes uo on uo.user_id = u.id
    where uo.org_id = new.org_id and uo.is_admin = true
  loop
    insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo, mensagem, payload, link)
    values (
      new.org_id,
      v_admin.user_id,
      'sistema.job_falhou',
      'Falha num job agendado',
      coalesce(new.last_error, 'Sem detalhe'),
      jsonb_build_object('source_table', new.source_table, 'job_type', new.job_type, 'last_error', new.last_error),
      '/admin/automacao'
    )
    returning id into v_notification_id;

    insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade, destinatario_id, link)
    values (
      new.org_id,
      'sistema_job_falhou',
      'Falha num job agendado',
      coalesce(new.last_error, 'Sem detalhe'),
      'urgente',
      v_admin.user_id,
      '/admin/automacao'
    );

    if v_admin.email is not null then
      insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
      values (
        v_notification_id,
        new.org_id,
        'email',
        v_admin.email,
        'sistema.job_falhou',
        jsonb_build_object('source_table', new.source_table, 'job_type', new.job_type, 'last_error', new.last_error)
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_failed_job_notify on public.failed_jobs;
create trigger on_failed_job_notify
after insert on public.failed_jobs
for each row execute function public.handle_failed_job_notify();

-- 2) Template de email — email ativado por omissão para este (ao
--    contrário dos avisos de negócio normais): é uma falha técnica, não
--    deve passar despercebida. seed_automacao_defaults() volta a incluí-lo
--    para novas orgs; backfill abaixo aplica às orgs já existentes.
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

-- 3) Torna o novo tipo visível na bell (mesmo padrão dos outros tipos
--    automáticos dirigidos a um destinatário concreto).
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
        'sistema_job_falhou'
      ])
      and destinatario_id = auth.uid()
    )
  )
);
