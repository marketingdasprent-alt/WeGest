-- ============================================================
-- "IUC da viatura a pagar" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Item 6/13 da lista do chefe. IUC é devido todos os anos no mesmo
-- mês/dia da matrícula original — sem coluna nova, calculado a partir
-- de viaturas.data_matricula (data_matricula + N anos, N = anos
-- completos desde a matrícula + 1, para garantir que é sempre a
-- PRÓXIMA ocorrência).
-- ============================================================

begin;
select plan(2);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000aa0000', 'Org IUC', 'iuc-kk');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000aa0001', 'admin@iuc-kk.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000aa0001', '00000000-0000-0000-0000-000000aa0000', true);

-- Viatura A: matriculada há 3 anos, aniversário da matrícula daqui a 10
-- dias — deve disparar (dentro da janela de 15 dias).
insert into public.viaturas (id, org_id, matricula, marca, modelo, data_matricula) values
  ('00000000-0000-0000-0000-000000aa0010', '00000000-0000-0000-0000-000000aa0000', 'IU-00-CA', 'Renault', 'Clio',
   (current_date + 10) - interval '3 years');

-- Viatura B: aniversário da matrícula daqui a 60 dias — NÃO deve disparar.
insert into public.viaturas (id, org_id, matricula, marca, modelo, data_matricula) values
  ('00000000-0000-0000-0000-000000aa0011', '00000000-0000-0000-0000-000000aa0000', 'IU-00-CB', 'Renault', 'Clio',
   (current_date + 60) - interval '5 years');

select public.emit_expiry_events();

-- 1. Viatura com aniversário da matrícula em 10 dias publica o evento.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000aa0010' and event_type = 'viatura.iuc_a_pagar'),
  1,
  'viatura com IUC a vencer em 10 dias publica viatura.iuc_a_pagar'
);

select public.process_domain_events();
select public.execute_automation_runs();

-- 2. Viatura com aniversário a 60 dias não dispara nada.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000aa0011' and event_type = 'viatura.iuc_a_pagar'),
  0,
  'viatura com IUC a vencer daqui a 60 dias não dispara o alerta'
);

select * from finish();
rollback;
