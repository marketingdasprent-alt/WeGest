-- ============================================================
-- "Alerta Plano de Manutenção preventiva da viatura" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Item 7/13 da lista do chefe. Dispara quando proxima_manutencao_data
-- está a <= 15 dias, OU quando km_atual está a <= 500 km de
-- proxima_manutencao_km (o que ocorrer primeiro).
-- ============================================================

begin;
select plan(4);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org Manutencao', 'manut-a0');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0001', 'admin@manut-a0.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0000', true);

-- Viatura A: próxima manutenção por data daqui a 10 dias — deve disparar.
insert into public.viaturas (id, org_id, matricula, marca, modelo, proxima_manutencao_data, proxima_manutencao_km) values
  ('00000000-0000-0000-0000-0000000a0010', '00000000-0000-0000-0000-0000000a0000', 'MA-00-DA', 'Renault', 'Clio',
   current_date + 10, null);

-- Viatura B: próxima manutenção por data daqui a 60 dias — NÃO deve disparar.
insert into public.viaturas (id, org_id, matricula, marca, modelo, proxima_manutencao_data, proxima_manutencao_km) values
  ('00000000-0000-0000-0000-0000000a0011', '00000000-0000-0000-0000-0000000a0000', 'MA-00-DB', 'Renault', 'Clio',
   current_date + 60, null);

-- Viatura C: próxima manutenção por km, faltam 300 km (dentro da janela de 500 km) — deve disparar.
insert into public.viaturas (id, org_id, matricula, marca, modelo, km_atual, proxima_manutencao_data, proxima_manutencao_km) values
  ('00000000-0000-0000-0000-0000000a0012', '00000000-0000-0000-0000-0000000a0000', 'MA-00-DC', 'Renault', 'Clio',
   50000, null, 50300);

-- Viatura D: próxima manutenção por km, faltam 5000 km — NÃO deve disparar.
insert into public.viaturas (id, org_id, matricula, marca, modelo, km_atual, proxima_manutencao_data, proxima_manutencao_km) values
  ('00000000-0000-0000-0000-0000000a0013', '00000000-0000-0000-0000-0000000a0000', 'MA-00-DD', 'Renault', 'Clio',
   50000, null, 55000);

select public.emit_expiry_events();

-- 1. Viatura A (data a 10 dias) publica o evento.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000a0010' and event_type = 'viatura.manutencao_preventiva_expirando'),
  1,
  'viatura com manutenção agendada para daqui a 10 dias publica viatura.manutencao_preventiva_expirando'
);

-- 2. Viatura B (data a 60 dias) não dispara.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000a0011' and event_type = 'viatura.manutencao_preventiva_expirando'),
  0,
  'viatura com manutenção agendada para daqui a 60 dias não dispara o alerta'
);

-- 3. Viatura C (faltam 300 km) publica o evento.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000a0012' and event_type = 'viatura.manutencao_preventiva_expirando'),
  1,
  'viatura a 300 km da próxima manutenção publica viatura.manutencao_preventiva_expirando'
);

-- 4. Viatura D (faltam 5000 km) não dispara.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000a0013' and event_type = 'viatura.manutencao_preventiva_expirando'),
  0,
  'viatura a 5000 km da próxima manutenção não dispara o alerta'
);

select public.process_domain_events();
select public.execute_automation_runs();

select * from finish();
rollback;
