-- ============================================================
-- Digest diário de email — fecha o incidente de 1764 emails/dia
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Incidente real: contrato_renting.renovacao_proxima manda um email por
-- CONTRATO para todos os admins/renting_contratos — um backlog de 84
-- contratos gerou 1764 emails para 21 pessoas (~84 por pessoa) num dia.
-- Regras com acao_config.enviar_email_digest=true deixam de enfileirar
-- email imediato (execute_automation_runs) — em vez disso, este job
-- agrupa tudo o que cada destinatário tem pendente num ÚNICO email.
-- ============================================================

begin;
select plan(7);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000030000', 'Org Digest', 'digest-h');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000030a01', 'gestor@digest-h.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000030a01', '00000000-0000-0000-0000-000000030000', true);

-- Regra em modo digest — enviar_email=true MAS enviar_email_digest=true
-- também: execute_automation_runs não deve enfileirar email nenhum.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000463001', '00000000-0000-0000-0000-000000030000', 'teste.digest', 'Regra Digest Teste', 'teste.digest_evento', 'notificacao',
   '{"template_codigo":"teste.digest_evento","destinatarios_recurso":"renting_contratos","enviar_email":true,"enviar_email_digest":true,"titulo":"Contrato a renovar"}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-0000004c3001', '00000000-0000-0000-0000-000000463001', '00000000-0000-0000-0000-000000030000', 'contratos_renting', '00000000-0000-0000-0000-000000ef3001'),
  ('00000000-0000-0000-0000-0000004c3002', '00000000-0000-0000-0000-000000463001', '00000000-0000-0000-0000-000000030000', 'contratos_renting', '00000000-0000-0000-0000-000000ef3002'),
  ('00000000-0000-0000-0000-0000004c3003', '00000000-0000-0000-0000-000000463001', '00000000-0000-0000-0000-000000030000', 'contratos_renting', '00000000-0000-0000-0000-000000ef3003');

select public.execute_automation_runs();

-- 1. As 3 notificações internas foram criadas normalmente (bell continua a funcionar).
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-000000030a01' and template_codigo = 'teste.digest_evento'),
  3,
  'as notificações internas continuam a ser criadas normalmente em modo digest'
);

-- 2. MAS nenhum email individual foi enfileirado — este é o próprio fix do incidente.
select is(
  (select count(*)::int from public.notification_queue where template_codigo = 'teste.digest_evento'),
  0,
  'enviar_email_digest=true não enfileira email imediato por notificação'
);

-- 3. Correr o digest agrupa as 3 num único email.
select public.enviar_digests_diarios();

select is(
  (select count(*)::int from public.notification_queue where template_codigo = 'digest.resumo_diario' and destinatario = 'gestor@digest-h.pt'),
  1,
  'enviar_digests_diarios() agrupa as 3 notificações pendentes num único email'
);

-- 4. O payload do digest sabe que são 3 itens.
select is(
  (select (payload_render->>'total')::int from public.notification_queue where template_codigo = 'digest.resumo_diario' and destinatario = 'gestor@digest-h.pt'),
  3,
  'o payload do digest regista o total de itens agrupados'
);

-- 5. As 3 notificações originais ficam marcadas como já incluídas no digest.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-000000030a01' and template_codigo = 'teste.digest_evento' and digest_enviado_em is not null),
  3,
  'as notificações originais ficam marcadas como já incluídas num digest'
);

-- 6. Correr o digest outra vez não duplica (nada novo por agrupar).
select public.enviar_digests_diarios();

select is(
  (select count(*)::int from public.notification_queue where template_codigo = 'digest.resumo_diario'),
  1,
  'correr o digest outra vez não duplica o email — nada de novo por agrupar'
);

-- 7. Existe o template de email do digest.
select is(
  (select count(*)::int from public.notification_templates where codigo = 'digest.resumo_diario' and canal = 'email' and org_id = '00000000-0000-0000-0000-000000030000'),
  1,
  'seed_automacao_defaults() cria o template de email do digest'
);

select * from finish();
rollback;
