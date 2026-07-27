-- ============================================================
-- Motor de Automação — fecha o canal email do MVP (E1/E2/G1)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- A arquitetura da Fase 2 previa "notification_templates +
-- notification_queue + notification_delivery, canal email apenas" como
-- parte do MVP — o código (send-notification-queue-email) já lia/escrevia
-- estas tabelas, mas nenhuma linha de notification_templates existia e as
-- 5 regras seedadas tinham enviar_email=false, incluindo as 4 de
-- expiração (E1/E2/G1) que a Fase 1 pedia com canal "Notificação interna
-- + Email". cobranca.gerada (I1/I2) fica deliberadamente de fora — o
-- utilizador decidiu explicitamente não automatizar essa via email.
-- ============================================================

begin;
select plan(10);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000c0000', 'Org Email Expiracao', 'email-expiracao-c');

select public.seed_automacao_defaults('00000000-0000-0000-0000-0000000c0000');

-- 1. As 4 regras de expiração passam a ter enviar_email=true.
select is(
  (
    select count(*)::int from public.automation_rules
    where org_id = '00000000-0000-0000-0000-0000000c0000'
      and event_type in ('viatura.seguro_expirando', 'viatura.inspecao_expirando', 'motorista.carta_expirando', 'motorista.licenca_tvde_expirando')
      and (acao_config->>'enviar_email')::boolean = true
  ),
  4,
  'as 4 regras de expiração (E1/E2/G1) passam a ter enviar_email=true'
);

-- 2. cobranca.gerada mantém-se enviar_email=false (I1/I2, decisão do utilizador intacta).
select is(
  (
    select (acao_config->>'enviar_email')::boolean from public.automation_rules
    where org_id = '00000000-0000-0000-0000-0000000c0000' and event_type = 'cobranca.gerada'
  ),
  false,
  'cobranca.gerada mantém enviar_email=false — não se toca na decisão de não automatizar faturação'
);

-- 3. As 4 regras de expiração ganham um template de email.
select is(
  (
    select array_agg(codigo order by codigo) from public.notification_templates
    where org_id = '00000000-0000-0000-0000-0000000c0000' and canal = 'email'
  ),
  array['motorista.carta_expirando', 'motorista.licenca_tvde_expirando', 'viatura.inspecao_expirando', 'viatura.seguro_expirando'],
  'seed_automacao_defaults() cria os 4 templates de email esperados'
);

-- 4. Não existe template de email para cobranca.gerada (não há envio a fazer).
select is(
  (select count(*)::int from public.notification_templates where org_id = '00000000-0000-0000-0000-0000000c0000' and codigo = 'cobranca.gerada'),
  0,
  'não é criado nenhum template de email para cobranca.gerada'
);

-- 5. Os templates estão ativos e no canal certo (o que o worker efetivamente procura).
select is(
  (select count(*)::int from public.notification_templates where org_id = '00000000-0000-0000-0000-0000000c0000' and canal = 'email' and ativo = true and idioma = 'pt-PT'),
  4,
  'os 4 templates estão ativos, canal email, idioma pt-PT'
);

-- 6. O template de seguro usa a variável que o payload do evento realmente fornece.
select ok(
  (select corpo_template from public.notification_templates where org_id = '00000000-0000-0000-0000-0000000c0000' and codigo = 'viatura.seguro_expirando' and canal = 'email') like '%{{matricula}}%',
  'o corpo do template de seguro referencia {{matricula}}, que emit_expiry_events() fornece'
);

-- 7. Chamar seed_automacao_defaults() outra vez não duplica os templates.
select public.seed_automacao_defaults('00000000-0000-0000-0000-0000000c0000');

select is(
  (select count(*)::int from public.notification_templates where org_id = '00000000-0000-0000-0000-0000000c0000' and canal = 'email'),
  4,
  'chamar seed_automacao_defaults() outra vez não duplica os templates'
);

-- 8/9. emit_expiry_events() passa a incluir o nome do motorista no payload
-- (sem isto, nem a notificação interna nem o email dizem QUEM está a expirar).
insert into public.motoristas_ativos (id, org_id, nome, carta_validade, licenca_tvde_validade, status_ativo) values
  ('00000000-0000-0000-0000-000000m1e0c1', '00000000-0000-0000-0000-0000000c0000', 'Motorista Email Teste', current_date + 7, current_date + 2, true);

select public.emit_expiry_events();

select is(
  (select payload->>'nome' from public.domain_events where entity_id = '00000000-0000-0000-0000-000000m1e0c1' and event_type = 'motorista.carta_expirando'),
  'Motorista Email Teste',
  'motorista.carta_expirando passa a incluir o nome do motorista no payload'
);

select is(
  (select payload->>'nome' from public.domain_events where entity_id = '00000000-0000-0000-0000-000000m1e0c1' and event_type = 'motorista.licenca_tvde_expirando'),
  'Motorista Email Teste',
  'motorista.licenca_tvde_expirando passa a incluir o nome do motorista no payload'
);

-- 10. Ponta-a-ponta: o pipeline todo (evento → regra → executor) passa a
-- enfileirar um email de verdade para o seguro a expirar, coisa que hoje
-- (enviar_email=false) nunca acontecia.
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000c0001', 'Org Email E2E', 'email-expiracao-c-e2e');

select public.seed_automacao_defaults('00000000-0000-0000-0000-0000000c0001');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0002', 'gestor@email-expiracao-c-e2e.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000c0001', true);

insert into public.viaturas (id, org_id, matricula, marca, modelo, seguro_validade, is_vendida) values
  ('00000000-0000-0000-0000-000000v1e0c1', '00000000-0000-0000-0000-0000000c0001', 'EE-11-EE', 'Toyota', 'Corolla', current_date + 10, false);

select public.emit_expiry_events();
select public.process_domain_events();
select public.execute_automation_runs();

select is(
  (
    select count(*)::int from public.notification_queue nq
    join public.notifications n on n.id = nq.notification_id
    where nq.org_id = '00000000-0000-0000-0000-0000000c0001'
      and nq.canal = 'email'
      and nq.template_codigo = 'viatura.seguro_expirando'
      and nq.destinatario = 'gestor@email-expiracao-c-e2e.pt'
  ),
  1,
  'ponta-a-ponta: seguro a expirar chega mesmo a notification_queue como email'
);

select * from finish();
rollback;
