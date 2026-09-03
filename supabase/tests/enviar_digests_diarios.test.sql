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
select plan(9);

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

-- 8-9. Sem `mensagem` (o caso normal: `processar_automation_run` nunca a
--      escreve), a linha usa o `payload` — as mesmas etiquetas que já lá
--      estão. `link` e chaves `_id` ficam de fora (uuid interno e URL crua
--      não dizem nada numa linha de texto); o resto aparece como
--      "Campo: valor". Ver 20260905130000.
insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id, payload) values
  ('00000000-0000-0000-0000-0000004c3009', '00000000-0000-0000-0000-000000463001', '00000000-0000-0000-0000-000000030000', 'contratos_renting', '00000000-0000-0000-0000-000000ef3009',
   jsonb_build_object('matricula', 'AT-36-XD', 'cliente_id', '11111111-1111-1111-1111-111111111111', 'link', 'https://wegest.pt/x'));

insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo, mensagem, payload, rule_run_id) values (
  '00000000-0000-0000-0000-000000030000', '00000000-0000-0000-0000-000000030a01', 'teste.digest_evento', 'Contrato a renovar', null,
  jsonb_build_object('matricula', 'AT-36-XD', 'cliente_id', '11111111-1111-1111-1111-111111111111', 'link', 'https://wegest.pt/x'),
  '00000000-0000-0000-0000-0000004c3009'
);

select public.enviar_digests_diarios();

-- `created_at` é `now()` — constante ao longo de TODA a transacção do
-- ficheiro (não `clock_timestamp()`), por isso este email do digest e o dos
-- testes 3-6 empatam nele; "order by created_at desc limit 1" não distingue
-- os dois. `total = '1'` distingue-os de forma inequívoca — só este grupo
-- tem um único item.
select ok(
  (select payload_render->>'lista' from public.notification_queue
     where template_codigo = 'digest.resumo_diario' and destinatario = 'gestor@digest-h.pt'
       and payload_render->>'total' = '1') like '%Matricula: AT-36-XD%',
  'sem mensagem, a linha do digest mostra o payload (ex.: a matrícula)'
);

select ok(
  (select payload_render->>'lista' from public.notification_queue
     where template_codigo = 'digest.resumo_diario' and destinatario = 'gestor@digest-h.pt'
       and payload_render->>'total' = '1') not like '%https://wegest.pt/x%'
  and
  (select payload_render->>'lista' from public.notification_queue
     where template_codigo = 'digest.resumo_diario' and destinatario = 'gestor@digest-h.pt'
       and payload_render->>'total' = '1') not like '%11111111-1111-1111-1111-111111111111%',
  'a linha do digest não expõe o link cru nem o uuid interno de cliente_id'
);

select * from finish();
rollback;
