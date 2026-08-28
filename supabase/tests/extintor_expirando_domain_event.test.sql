-- ============================================================
-- "Extintor da viatura a expirar" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Item 5/13 da lista do chefe ("documentos da viatura a expirar") —
-- viaturas.extintor_validade é o único documento com dados reais
-- preenchidos hoje; mesmo padrão (15 dias) de emit_expiry_events()
-- para seguro/IPO.
-- ============================================================

begin;
select plan(2);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000dd0000', 'Org Extintor', 'extintor-jj');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000dd0001', 'admin@extintor-jj.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000dd0001', '00000000-0000-0000-0000-000000dd0000', true);

-- Viatura A: extintor a expirar em 10 dias — deve disparar.
insert into public.viaturas (id, org_id, matricula, marca, modelo, extintor_validade) values
  ('00000000-0000-0000-0000-000000dd0010', '00000000-0000-0000-0000-000000dd0000', 'EX-00-AA', 'Peugeot', '208', current_date + 10);

-- Viatura B: extintor válido por mais 60 dias — NÃO deve disparar.
insert into public.viaturas (id, org_id, matricula, marca, modelo, extintor_validade) values
  ('00000000-0000-0000-0000-000000dd0011', '00000000-0000-0000-0000-000000dd0000', 'EX-00-BB', 'Peugeot', '208', current_date + 60);

select public.emit_expiry_events();

-- 1. Extintor a expirar em 10 dias publica o domain_event.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000dd0010' and event_type = 'viatura.extintor_expirando'),
  1,
  'extintor a expirar em 10 dias publica viatura.extintor_expirando'
);

select public.process_domain_events();
select public.execute_automation_runs();

-- 2. Extintor válido por 60 dias não publica nada.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000dd0011' and event_type = 'viatura.extintor_expirando'),
  0,
  'extintor válido por 60 dias não dispara o alerta'
);

select * from finish();
rollback;
