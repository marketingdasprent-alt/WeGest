-- ============================================================
-- "Candidatura de motorista parada para aceitar" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- emit_candidaturas_paradas_events() fecha o buraco em que o aviso
-- existente (notificar_motorista_pendente) desaparece assim que alguém
-- abre a candidatura (status → em_analise), mesmo sem decisão final.
-- Scan diário: candidaturas em 'submetido'/'em_analise' há mais de 3 dias.
-- ============================================================

begin;
select plan(3);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000hh0000', 'Org Candidatura Parada', 'candidatura-parada-h');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000hh0001', 'admin@candidatura-parada.pt'),
  ('00000000-0000-0000-0000-000000hh0002', 'candidato-a@candidatura-parada.pt'),
  ('00000000-0000-0000-0000-000000hh0003', 'candidato-b@candidatura-parada.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000hh0001', '00000000-0000-0000-0000-000000hh0000', true);

-- Candidatura A: submetida há 4 dias — deve disparar.
insert into public.motorista_candidaturas (id, user_id, nome, email, status, data_submissao, org_id)
values (
  '00000000-0000-0000-0000-000000hh0010', '00000000-0000-0000-0000-000000hh0002',
  'Candidato Parado', 'candidato-a@candidatura-parada.pt', 'submetido', now() - interval '4 days',
  '00000000-0000-0000-0000-000000hh0000'
);

-- Candidatura B: submetida há 1 dia — NÃO deve disparar ainda.
insert into public.motorista_candidaturas (id, user_id, nome, email, status, data_submissao, org_id)
values (
  '00000000-0000-0000-0000-000000hh0011', '00000000-0000-0000-0000-000000hh0003',
  'Candidato Recente', 'candidato-b@candidatura-parada.pt', 'submetido', now() - interval '1 day',
  '00000000-0000-0000-0000-000000hh0000'
);

select public.emit_candidaturas_paradas_events();

-- 1. Candidatura parada há 4 dias publica o domain_event.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000hh0010' and event_type = 'motorista.candidatura_parada'),
  1,
  'candidatura parada há 4 dias publica motorista.candidatura_parada'
);

-- 2. Candidatura recente (1 dia) NÃO publica nada ainda.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000hh0011' and event_type = 'motorista.candidatura_parada'),
  0,
  'candidatura submetida há só 1 dia ainda não dispara o alerta'
);

select public.process_domain_events();
select public.execute_automation_runs();

-- 3. O pipeline completo chega a notificar o admin.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-000000hh0001' and template_codigo = 'motorista.candidatura_parada'),
  1,
  'o admin recebe a notificação da candidatura parada'
);

select * from finish();
rollback;
