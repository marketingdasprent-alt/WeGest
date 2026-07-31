-- ============================================================
-- "Candidatura de motorista parada para aceitar" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- emit_candidaturas_paradas_events() fecha o buraco em que o aviso
-- existente (notificar_motorista_pendente) desaparece assim que alguém
-- abre a candidatura (status → em_analise), mesmo sem decisão final.
-- Scan diário: 'submetido'/'em_analise' há mais de 3 dias, e
-- 'rascunho' há mais de 7.
--
-- ATENÇÃO ao ler este ficheiro. Até 31/07/2026 ele testava apenas
-- 'submetido' — e passava. A funcionalidade, essa, nunca disparou uma
-- vez em produção, porque em produção não existe uma única candidatura
-- em 'submetido' ou 'em_analise': os dados reais só usam 'rascunho' e
-- 'aprovado'. O teste criava os seus próprios dados no estado que lhe
-- convinha e ficava verde sobre código morto.
--
-- Por isso os casos de 'rascunho' abaixo não são um extra: são o único
-- ramo que a produção percorre. Se algum dia falharem, o alerta voltou
-- a ficar cego para as candidaturas que se perdem de facto.
-- ============================================================

begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000hh0000', 'Org Candidatura Parada', 'candidatura-parada-h');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000hh0001', 'admin@candidatura-parada.pt'),
  ('00000000-0000-0000-0000-000000hh0002', 'candidato-a@candidatura-parada.pt'),
  ('00000000-0000-0000-0000-000000hh0003', 'candidato-b@candidatura-parada.pt'),
  ('00000000-0000-0000-0000-000000hh0004', 'candidato-c@candidatura-parada.pt'),
  ('00000000-0000-0000-0000-000000hh0005', 'candidato-d@candidatura-parada.pt');

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

-- Candidatura C: rascunho há 18 dias. É a forma exacta do caso real da
-- PREMIUM RIDE a 31/07 — candidato começou, nunca submeteu, ninguém soube.
insert into public.motorista_candidaturas (id, user_id, nome, email, status, created_at, org_id)
values (
  '00000000-0000-0000-0000-000000hh0012', '00000000-0000-0000-0000-000000hh0004',
  'Candidato Rascunho Velho', 'candidato-c@candidatura-parada.pt', 'rascunho', now() - interval '18 days',
  '00000000-0000-0000-0000-000000hh0000'
);

-- Candidatura D: rascunho há 2 dias — alguém a preencher com calma.
-- NÃO deve disparar: o prazo do rascunho é 7 dias, não 3.
insert into public.motorista_candidaturas (id, user_id, nome, email, status, created_at, org_id)
values (
  '00000000-0000-0000-0000-000000hh0013', '00000000-0000-0000-0000-000000hh0005',
  'Candidato A Preencher', 'candidato-d@candidatura-parada.pt', 'rascunho', now() - interval '2 days',
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

-- 3. Rascunho há 18 dias dispara. ESTE é o ramo que a produção percorre:
--    antes de 31/07/2026 o alerta ignorava 'rascunho' por completo, e as
--    4 candidaturas realmente perdidas nunca geraram um único aviso.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000hh0012' and event_type = 'motorista.candidatura_parada'),
  1,
  'rascunho abandonado há 18 dias publica motorista.candidatura_parada'
);

-- 4. Rascunho há 2 dias não dispara — prazo do rascunho é 7 dias.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000hh0013' and event_type = 'motorista.candidatura_parada'),
  0,
  'rascunho com 2 dias ainda não dispara (alguém a preencher com calma)'
);

-- 5. O payload distingue as duas situações, porque pedem acções
--    diferentes: telefonar ao candidato, ou decidir a candidatura.
select is(
  (select payload->>'situacao' from public.domain_events where entity_id = '00000000-0000-0000-0000-000000hh0012' and event_type = 'motorista.candidatura_parada'),
  'começou a candidatura e nunca a submeteu',
  'o rascunho abandonado diz ao gestor que o candidato não terminou'
);

select public.process_domain_events();
select public.execute_automation_runs();

-- 6. O pipeline completo chega a notificar o admin — nos dois casos.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-000000hh0001' and template_codigo = 'motorista.candidatura_parada'),
  2,
  'o admin recebe as notificações da candidatura submetida e do rascunho abandonado'
);

select * from finish();
rollback;
