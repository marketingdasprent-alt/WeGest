-- ============================================================
-- "Alerta de reparação aberta há demasiado tempo" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Item 9/13 da lista do chefe. Não existe nenhum conceito de SLA/prazo
-- no sistema (nem assistencia_categorias, nem prioridade, nem
-- data_estimada, esta pouco preenchida). Limiar fixo escolhido pelo
-- utilizador: 7 dias desde created_at sem o ticket estar
-- resolvido/fechado — scan diário, mesmo padrão de
-- emit_candidaturas_paradas_events() (item 3).
-- ============================================================

begin;
select plan(3);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000e0000', 'Org Tickets E', 'tkt-e0');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e0001', 'admin@tkt-e0.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e0000', true);

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000e0000', 'TE-00-CA', 'Renault', 'Clio');

-- Ticket A: aberto há 10 dias, status 'aberto' — deve disparar.
insert into public.assistencia_tickets (id, viatura_id, titulo, status, prioridade, org_id, criado_por, created_at) values
  ('00000000-0000-0000-0000-0000000e0010', '00000000-0000-0000-0000-0000000e0002', 'Barulho no motor', 'aberto', 'media',
   '00000000-0000-0000-0000-0000000e0000', '00000000-0000-0000-0000-0000000e0001', now() - interval '10 days');

-- Ticket B: aberto há apenas 2 dias — NÃO deve disparar.
insert into public.assistencia_tickets (id, viatura_id, titulo, status, prioridade, org_id, criado_por, created_at) values
  ('00000000-0000-0000-0000-0000000e0011', '00000000-0000-0000-0000-0000000e0002', 'Pneu furado', 'aberto', 'alta',
   '00000000-0000-0000-0000-0000000e0000', '00000000-0000-0000-0000-0000000e0001', now() - interval '2 days');

-- Ticket C: criado há 10 dias mas já resolvido — NÃO deve disparar.
insert into public.assistencia_tickets (id, viatura_id, titulo, status, prioridade, org_id, criado_por, created_at) values
  ('00000000-0000-0000-0000-0000000e0012', '00000000-0000-0000-0000-0000000e0002', 'Troca de óleo', 'resolvido', 'baixa',
   '00000000-0000-0000-0000-0000000e0000', '00000000-0000-0000-0000-0000000e0001', now() - interval '10 days');

select public.emit_tickets_atrasados_events();

-- 1. Ticket aberto há 10 dias e ainda não resolvido publica o evento.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000e0010' and event_type = 'assistencia_ticket.aberto_demasiado_tempo'),
  1,
  'ticket aberto há 10 dias sem resolução publica assistencia_ticket.aberto_demasiado_tempo'
);

-- 2. Ticket aberto há apenas 2 dias não dispara.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000e0011' and event_type = 'assistencia_ticket.aberto_demasiado_tempo'),
  0,
  'ticket aberto há apenas 2 dias não dispara o alerta'
);

-- 3. Ticket já resolvido, mesmo que antigo, não dispara.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000e0012' and event_type = 'assistencia_ticket.aberto_demasiado_tempo'),
  0,
  'ticket já resolvido não dispara o alerta mesmo criado há 10 dias'
);

select public.process_domain_events();
select public.execute_automation_runs();

select * from finish();
rollback;
