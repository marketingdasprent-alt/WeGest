-- ============================================================
-- Total de um TVDE na lista de contratos (20261012150000) — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- O #421 cobrava 475 €/semana e a lista mostrava 0,00 €: a vista só sabia
-- tarifa_diaria × dias, e um TVDE não tem nenhum dos dois.
--   (1) TVDE sem valor acordado: o preço semanal da tarifa para o modelo;
--   (2) valor acordado: é esse que manda;
--   (3) TVDE sem tarifa: continua a 0 (não se inventa preço);
--   (4) rent-a-car: tarifa_diaria × dias, como antes.
-- ============================================================

begin;
select plan(4);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000002b0000', 'Org Total TVDE', 'total-tvde');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000002b00a1', 'gestor@total-tvde.pt');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000002b0aa1', '00000000-0000-0000-0000-0000002b0000', 'BMW');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000002b0ab1', '00000000-0000-0000-0000-0000002b0000',
   '00000000-0000-0000-0000-0000002b0aa1', '530e');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id)
select ('00000000-0000-0000-0000-0000002b0e0' || n)::uuid, '00000000-0000-0000-0000-0000002b0000',
       'TT-0' || n || '-TT', '00000000-0000-0000-0000-0000002b0aa1', '00000000-0000-0000-0000-0000002b0ab1'
  from generate_series(1, 4) as n;

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000002b0c01', '00000000-0000-0000-0000-0000002b0000', 'Cliente Total TVDE');

insert into public.renting_tarifas (id, org_id, nome, tipo, ativa) values
  ('00000000-0000-0000-0000-0000002b0f01', '00000000-0000-0000-0000-0000002b0000', 'TVDE - Base', 'tvde', true);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_semana) values
  ('00000000-0000-0000-0000-0000002b0000', '00000000-0000-0000-0000-0000002b0f01',
   '00000000-0000-0000-0000-0000002b0ab1', 475);

-- (n, regime, tarifa, valor acordado, tarifa_diaria, data_fim)
create temp table fixture on commit drop as
select * from (values
  (1, 'tvde',       true,  null::numeric, null::numeric, null::timestamptz),
  (2, 'tvde',       true,  300::numeric,  null::numeric, null::timestamptz),
  (3, 'tvde',       false, null::numeric, null::numeric, null::timestamptz),
  (4, 'rent_a_car', false, null::numeric, 40::numeric,   timestamptz '2026-09-04 10:00+00')
) as f(n, regime, com_tarifa, manual, diaria, fim);

insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado, regime)
select ('00000000-0000-0000-0000-0000002b0d0' || n)::uuid, '00000000-0000-0000-0000-0000002b0000',
       991200 + n, timestamptz '2026-09-01 10:00+00', ('00000000-0000-0000-0000-0000002b0e0' || n)::uuid,
       '00000000-0000-0000-0000-0000002b0c01', 'concluida', regime::public.contrato_regime_enum
  from fixture;

insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, tarifa_id, valor_total_manual,
   tarifa_diaria, is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias, created_by)
select ('00000000-0000-0000-0000-0000002b000' || n)::uuid, '00000000-0000-0000-0000-0000002b0000',
       991200 + n, ('00000000-0000-0000-0000-0000002b0d0' || n)::uuid,
       '00000000-0000-0000-0000-0000002b0c01', ('00000000-0000-0000-0000-0000002b0e0' || n)::uuid,
       'TT-0' || n || '-TT', timestamptz '2026-09-01 10:00+00', fim,
       'em_curso', 'pendente', regime::public.contrato_regime_enum, 0,
       case when com_tarifa then '00000000-0000-0000-0000-0000002b0f01'::uuid end, manual, diaria,
       regime = 'tvde',
       case when regime = 'tvde' then 'intervalo_dias' end::public.contrato_renovacao_opcao_enum,
       case when regime = 'tvde' then 30 end,
       '00000000-0000-0000-0000-0000002b00a1'
  from fixture;

select is(
  (select total from public.contrato_renting_totais where contrato_id = '00000000-0000-0000-0000-0000002b0001'),
  475.00::numeric,
  'TVDE sem valor acordado: o preço semanal da tarifa para o modelo, não 0'
);

select is(
  (select total from public.contrato_renting_totais where contrato_id = '00000000-0000-0000-0000-0000002b0002'),
  300.00::numeric,
  'TVDE com valor acordado: é esse que manda'
);

select is(
  (select total from public.contrato_renting_totais where contrato_id = '00000000-0000-0000-0000-0000002b0003'),
  0.00::numeric,
  'TVDE sem tarifa: fica a 0, não se inventa preço'
);

select is(
  (select total from public.contrato_renting_totais where contrato_id = '00000000-0000-0000-0000-0000002b0004'),
  120.00::numeric,
  'rent-a-car: tarifa_diaria × dias, como antes'
);

select * from finish();
rollback;
