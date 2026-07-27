-- ============================================================
-- Motor de Automação — evento cobranca.gerada (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre o gatilho reativo que fecha o scope cut do Sub-projeto 2: uma
-- nova linha em contrato_cobrancas (gerada pelos crons semanais/mensais
-- já existentes) publica um evento cobranca.gerada em domain_events,
-- com o org_id herdado da reserva (via o trigger BEFORE INSERT já
-- existente) e o valor_total (coluna gerada) no payload.
-- ============================================================

begin;
select plan(3);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org A', 'cobranca-evento-a');

insert into public.clientes (id, nome, org_id) values
  ('00000000-0000-0000-0000-000000cl0001', 'Cliente Teste', '00000000-0000-0000-0000-0000000a0000');

insert into public.reservas (id, org_id, data_inicio) values
  ('00000000-0000-0000-0000-000000rs0001', '00000000-0000-0000-0000-0000000a0000', now());

insert into public.contrato_cobrancas (id, reserva_id, periodo_de, periodo_ate, destinatario_id, destinatario_papel, destinatario_nome, valor_sem_iva) values
  ('00000000-0000-0000-0000-000000cb0001', '00000000-0000-0000-0000-000000rs0001', current_date, current_date + 7, '00000000-0000-0000-0000-000000cl0001', 'cliente', 'Cliente Teste', 100.00);

-- 1. Um evento cobranca.gerada é publicado.
select is(
  (select count(*)::int from public.domain_events where entity_table = 'contrato_cobrancas' and entity_id = '00000000-0000-0000-0000-000000cb0001' and event_type = 'cobranca.gerada'),
  1,
  'inserir uma contrato_cobrancas publica um evento cobranca.gerada'
);

-- 2. O evento herda o org_id resolvido pela reserva.
select is(
  (select org_id from public.domain_events where entity_table = 'contrato_cobrancas' and entity_id = '00000000-0000-0000-0000-000000cb0001'),
  '00000000-0000-0000-0000-0000000a0000'::uuid,
  'o evento herda o org_id resolvido pela reserva (via set_contrato_cobranca_org_id)'
);

-- 3. O payload inclui o valor_total (coluna gerada: 100 + 23% IVA = 123.00).
select is(
  (select (payload->>'valor_total')::numeric from public.domain_events where entity_table = 'contrato_cobrancas' and entity_id = '00000000-0000-0000-0000-000000cb0001'),
  123.00,
  'o payload inclui o valor_total calculado'
);

select * from finish();
rollback;
