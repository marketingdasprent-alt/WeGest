-- ============================================================
-- Preço semanal do TVDE: acordado ou tarifa (20261124100000) — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- A tarifa é o preço vivo; um preço diferente só por pedido aprovado
-- (preco_semana_acordado). Prova-se que:
--   (1) o congelar ao facturar e a vista contrato_renting_totais seguem a
--       ordem do fecho semanal: valor manual > 0 manda; TVDE sem ele usa
--       acordado (0 vale), preço da tarifa, preço da tarifa para o modelo;
--   (2) rent-a-car continua tarifa_diaria x dias, e TVDE sem preço nenhum
--       continua a 0 (não se inventa preço);
--   (3) aplicar o preço negociado muda o próprio contrato quando nenhuma
--       semana fechou (em curso ou agendado) e abre versão nova quando já
--       fechou, e só mexe no valor do contrato se este era o preço semanal
--       antigo ou estava vazio (a renda mensal a uma empresa fica).
-- Datas relativas a now(): nada depende do dia da semana.
-- ============================================================

begin;
select plan(54);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação".
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f5fff', 'bootstrap@tvde-semanal.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f5000', 'Org TVDE Semanal', 'tvde-semanal');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f5a01', 'gestor@tvde-semanal.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000f5a01', '00000000-0000-0000-0000-0000000f5000');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000f5aa1', '00000000-0000-0000-0000-0000000f5000', 'Kia');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000000f5ab1', '00000000-0000-0000-0000-0000000f5000',
   '00000000-0000-0000-0000-0000000f5aa1', 'Ceed');

-- 25 viaturas do mesmo modelo: a trava de overbooking é por viatura.
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id)
select format('00000000-0000-0000-0000-0000000f5e%s', lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-0000000f5000', 'TS-' || lpad(n::text, 2, '0') || '-AA',
       '00000000-0000-0000-0000-0000000f5aa1', '00000000-0000-0000-0000-0000000f5ab1'
  from generate_series(1, 25) as n;

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000f5c01', '00000000-0000-0000-0000-0000000f5000', 'Cliente TVDE Semanal');

-- T1: sem preço próprio (cai no preço do modelo, 475). T2: preço da tarifa 390,
-- que ganha ao do modelo. T3: renting, para o rent-a-car.
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, preco_semana) values
  ('00000000-0000-0000-0000-0000000f5f01', '00000000-0000-0000-0000-0000000f5000', 'TVDE T1', 'tvde', true, null),
  ('00000000-0000-0000-0000-0000000f5f02', '00000000-0000-0000-0000-0000000f5000', 'TVDE T2', 'tvde', true, 390),
  ('00000000-0000-0000-0000-0000000f5f03', '00000000-0000-0000-0000-0000000f5000', 'Renting T3', 'renting', true, null);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_semana) values
  ('00000000-0000-0000-0000-0000000f5000', '00000000-0000-0000-0000-0000000f5f01',
   '00000000-0000-0000-0000-0000000f5ab1', 475),
  ('00000000-0000-0000-0000-0000000f5000', '00000000-0000-0000-0000-0000000f5f02',
   '00000000-0000-0000-0000-0000000f5ab1', 475);

create temp table semana on commit drop as
  select date_trunc('week', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon' as desde;

-- n 1-8: datas fixas (só lêem o total). n 9-23: aplicar o preço; "3d" começou
-- 3 dias antes da segunda-feira desta semana (menos de uma semana de idade),
-- "40d" há 40 dias.
-- (n, regime, tarifa, acordado, manual, tarifa_diaria, inicio, fim, estado, com_resumo, anterior)
create temp table fixture on commit drop as
select * from (values
  (1,  'tvde',       'f5f01', null::numeric, null::numeric, null::numeric, timestamptz '2026-09-01 10:00+00', null::timestamptz, 'em_curso',  false, null::int),
  (2,  'tvde',       'f5f01', 300::numeric,  null::numeric, null::numeric, timestamptz '2026-09-01 10:00+00', null::timestamptz, 'em_curso',  false, null),
  (3,  'tvde',       'f5f02', null::numeric, null::numeric, null::numeric, timestamptz '2026-09-01 10:00+00', null::timestamptz, 'em_curso',  false, null),
  (4,  'tvde',       'f5f01', null::numeric, 1400::numeric, null::numeric, timestamptz '2026-09-01 10:00+00', null::timestamptz, 'em_curso',  false, null),
  (5,  'tvde',       'f5f01', 300::numeric,  1400::numeric, null::numeric, timestamptz '2026-09-01 10:00+00', null::timestamptz, 'em_curso',  false, null),
  (6,  'rent_a_car', 'f5f03', null::numeric, null::numeric, 40::numeric,   timestamptz '2026-09-01 10:00+00', timestamptz '2026-09-04 10:00+00', 'em_curso', false, null),
  (7,  'tvde',       'f5f01', 0::numeric,    null::numeric, null::numeric, timestamptz '2026-09-01 10:00+00', null::timestamptz, 'em_curso',  false, null),
  (8,  'tvde',       null,    null::numeric, null::numeric, null::numeric, timestamptz '2026-09-01 10:00+00', null::timestamptz, 'em_curso',  false, null),
  -- 9-10: 3d, nada contado: no próprio sítio
  (9,  'tvde',       'f5f02', null::numeric, 390::numeric,  null::numeric, (select desde from semana) - interval '3 days', null::timestamptz, 'em_curso',  false, null),
  (10, 'tvde',       'f5f02', null::numeric, null::numeric, null::numeric, (select desde from semana) - interval '3 days', null::timestamptz, 'agendado', false, null),
  -- 11, 12, 15: 40d com resumo: versão nova
  (11, 'tvde',       'f5f02', null::numeric, 390::numeric,  null::numeric, now() - interval '40 days', null::timestamptz, 'em_curso',  true, null),
  (12, 'tvde',       'f5f01', null::numeric, 1400::numeric, null::numeric, now() - interval '40 days', null::timestamptz, 'em_curso',  true, null),
  -- 13-14: 40d sem nenhuma linha: não se prova que nenhuma semana foi contada
  (13, 'tvde',       'f5f01', null::numeric, 1400::numeric, null::numeric, now() - interval '40 days', null::timestamptz, 'em_curso',  false, null),
  (14, 'tvde',       'f5f01', null::numeric, 475::numeric,  null::numeric, now() - interval '40 days', null::timestamptz, 'em_curso',  false, null),
  (15, 'tvde',       'f5f01', 330::numeric,  330::numeric,  null::numeric, now() - interval '40 days', null::timestamptz, 'em_curso',  true, null),
  -- 16: 3d, renda mensal de 1400: no próprio sítio, manual intacto
  (16, 'tvde',       'f5f01', null::numeric, 1400::numeric, null::numeric, (select desde from semana) - interval '3 days', null::timestamptz, 'em_curso',  false, null),
  -- 17: 3d, condutor com líquido semanal (sem resumo): versão nova
  (17, 'tvde',       'f5f01', null::numeric, 475::numeric,  null::numeric, (select desde from semana) - interval '3 days', null::timestamptz, 'em_curso',  false, null),
  -- 18: renovação (v2) de 19, que tem o resumo: versão nova
  (18, 'tvde',       'f5f02', null::numeric, 390::numeric,  null::numeric, (select desde from semana) - interval '3 days', null::timestamptz, 'em_curso',  false, 19),
  (19, 'tvde',       'f5f02', null::numeric, 390::numeric,  null::numeric, now() - interval '40 days', null::timestamptz, 'em_curso',  true, null),
  -- 20: data_fim no passado (posta à mão abaixo): recusado
  (20, 'tvde',       'f5f01', null::numeric, 475::numeric,  null::numeric, (select desde from semana) - interval '3 days', null::timestamptz, 'em_curso',  false, null),
  -- 21: cobrança já gerada: versão nova
  (21, 'tvde',       'f5f01', null::numeric, 475::numeric,  null::numeric, (select desde from semana) - interval '3 days', null::timestamptz, 'em_curso',  false, null),
  -- 24: cobrança gerada à frente: no próprio sítio. 25: cobrança de semana passada: versão nova
  (24, 'tvde',       'f5f01', null::numeric, 475::numeric,  null::numeric, (select desde from semana) - interval '3 days', null::timestamptz, 'em_curso',  false, null),
  (25, 'tvde',       'f5f01', null::numeric, 475::numeric,  null::numeric, (select desde from semana) - interval '3 days', null::timestamptz, 'em_curso',  false, null),
  -- 22: sem preço antigo (sem tarifa) e manual 200: manual intacto
  (22, 'tvde',       null,    null::numeric, 200::numeric,  null::numeric, (select desde from semana) - interval '3 days', null::timestamptz, 'em_curso',  false, null),
  -- 23: manual 0 conta como vazio
  (23, 'tvde',       'f5f01', null::numeric, 0::numeric,    null::numeric, (select desde from semana) - interval '3 days', null::timestamptz, 'em_curso',  false, null)
) as f(n, regime, tarifa, acordado, manual, diaria, inicio, fim, estado, com_resumo, anterior);

create function pg_temp.cid(p_n int) returns uuid language sql as
  $$ select format('00000000-0000-0000-0000-0000000f5c%s', lpad(p_n::text, 2, '0'))::uuid $$;

insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado, regime)
select format('00000000-0000-0000-0000-0000000f5d%s', lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-0000000f5000', 995000 + n, inicio,
       format('00000000-0000-0000-0000-0000000f5e%s', lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-0000000f5c01', 'concluida', regime::public.contrato_regime_enum
  from fixture;

-- created_by: a trigger de abertura cria o evento de entrega com criado_por NOT NULL.
insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, tarifa_id, preco_semana_acordado,
   valor_total_manual, tarifa_diaria, is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias, contrato_anterior_id, versao, created_by)
select pg_temp.cid(n), '00000000-0000-0000-0000-0000000f5000', 995000 + n,
       format('00000000-0000-0000-0000-0000000f5d%s', lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-0000000f5c01',
       format('00000000-0000-0000-0000-0000000f5e%s', lpad(n::text, 2, '0'))::uuid,
       'TS-' || lpad(n::text, 2, '0') || '-AA', inicio, fim,
       estado::public.contrato_estado_operacional_enum, 'pendente', regime::public.contrato_regime_enum, 0,
       case when tarifa is not null then format('00000000-0000-0000-0000-0000000%s', tarifa)::uuid end,
       acordado, manual, diaria,
       regime = 'tvde',
       case when regime = 'tvde' then 'intervalo_dias' end::public.contrato_renovacao_opcao_enum,
       case when regime = 'tvde' then 30 end,
       case when anterior is not null then pg_temp.cid(anterior) end,
       case when anterior is not null then 2 else 1 end,
       '00000000-0000-0000-0000-0000000f5a01'
  from fixture where anterior is null;

-- A renovação (v2) vai depois da versão anterior.
insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, tarifa_id, preco_semana_acordado,
   valor_total_manual, tarifa_diaria, is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias, contrato_anterior_id, versao, created_by)
select pg_temp.cid(n), '00000000-0000-0000-0000-0000000f5000', 995000 + n,
       format('00000000-0000-0000-0000-0000000f5d%s', lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-0000000f5c01',
       format('00000000-0000-0000-0000-0000000f5e%s', lpad(n::text, 2, '0'))::uuid,
       'TS-' || lpad(n::text, 2, '0') || '-AA', inicio, fim,
       estado::public.contrato_estado_operacional_enum, 'pendente', regime::public.contrato_regime_enum, 0,
       case when tarifa is not null then format('00000000-0000-0000-0000-0000000%s', tarifa)::uuid end,
       acordado, manual, diaria,
       regime = 'tvde',
       case when regime = 'tvde' then 'intervalo_dias' end::public.contrato_renovacao_opcao_enum,
       case when regime = 'tvde' then 30 end,
       case when anterior is not null then pg_temp.cid(anterior) end,
       case when anterior is not null then 2 else 1 end,
       '00000000-0000-0000-0000-0000000f5a01'
  from fixture where anterior is not null;

-- Os contratos com semana fechada têm um resumo; os outros não têm nenhum.
insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000f5b01', '00000000-0000-0000-0000-0000000f5000', 'Motorista TVDE Semanal');
insert into public.motorista_resumo_semanal (org_id, motorista_id, contrato_id, viatura_id, semana_inicio, semana_fim)
select '00000000-0000-0000-0000-0000000f5000', '00000000-0000-0000-0000-0000000f5b01', pg_temp.cid(n),
       format('00000000-0000-0000-0000-0000000f5e%s', lpad(n::text, 2, '0'))::uuid,
       ((select desde from semana) at time zone 'Europe/Lisbon')::date - 14,
       ((select desde from semana) at time zone 'Europe/Lisbon')::date - 8
  from fixture where com_resumo;

-- 17: o condutor tem líquido semanal gravado, mas nenhum resumo.
insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000f5b02', '00000000-0000-0000-0000-0000000f5000', 'Motorista Liquido');
insert into public.contrato_condutores (org_id, contrato_id, motorista_id, is_principal, data_inicio) values
  ('00000000-0000-0000-0000-0000000f5000', pg_temp.cid(17),
   '00000000-0000-0000-0000-0000000f5b02', true, (select desde from semana) - interval '3 days');
insert into public.motorista_liquido_semanal (org_id, motorista_id, semana_inicio, semana_fim, liquido) values
  ('00000000-0000-0000-0000-0000000f5000', '00000000-0000-0000-0000-0000000f5b02',
   ((select desde from semana) at time zone 'Europe/Lisbon')::date - 7,
   ((select desde from semana) at time zone 'Europe/Lisbon')::date - 1, 100);

-- 21 e 25: cobrança semanal de uma semana já passada. 24: gerada à frente
-- (periodo_de >= segunda-feira), que ainda se reprecifica.
insert into public.contrato_cobrancas
  (org_id, contrato_id, periodo_de, periodo_ate, destinatario_id, destinatario_papel,
   destinatario_nome, valor_sem_iva, estado)
select '00000000-0000-0000-0000-0000000f5000', pg_temp.cid(c.n),
       ((select desde from semana) at time zone 'Europe/Lisbon')::date + c.dias,
       ((select desde from semana) at time zone 'Europe/Lisbon')::date + c.dias + 6,
       '00000000-0000-0000-0000-0000000f5c01', 'cliente', 'Cliente TVDE Semanal', 475, 'pendente'
  from (values (21, -7), (25, -7), (24, 0)) as c(n, dias);

-- 20: um TVDE vivo não pode nascer com data_fim (a trigger limpa-a); põe-se à
-- mão, como nos legados, com a trigger desligada só aqui.
alter table public.contratos_renting disable trigger trg_a_tvde_nasce_sem_data_fim;
update public.contratos_renting
   set data_fim = (select desde from semana) - interval '1 day'
 where id = pg_temp.cid(20);
alter table public.contratos_renting enable trigger trg_a_tvde_nasce_sem_data_fim;

-- ── Grants ─────────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.fn_aplicar_preco_semana_negociado(uuid, numeric, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fn_aplicar_preco_semana_negociado(uuid, numeric, uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.fn_aplicar_preco_semana_negociado(uuid, numeric, uuid)', 'EXECUTE'),
  'aplicar o preço continua só para service_role (nem authenticated nem anon)'
);

-- ── Vista contrato_renting_totais (IVA 0: total = base) ────

select is((select total from public.contrato_renting_totais where contrato_id = pg_temp.cid(1)), 475.00::numeric,
  'vista, TVDE sem acordado nem preço na tarifa: preço da tarifa para o modelo');
select is((select total from public.contrato_renting_totais where contrato_id = pg_temp.cid(2)), 300.00::numeric,
  'vista, TVDE com acordado: o acordado (antes era ignorado a favor do preço do modelo)');
select is((select total from public.contrato_renting_totais where contrato_id = pg_temp.cid(3)), 390.00::numeric,
  'vista, TVDE com preço na tarifa: ganha ao preço do modelo (ordem do fecho)');
select is((select total from public.contrato_renting_totais where contrato_id = pg_temp.cid(4)), 1400.00::numeric,
  'vista, valor manual de 1400 (renda mensal a empresa) mantém-se');
select is((select total from public.contrato_renting_totais where contrato_id = pg_temp.cid(5)), 1400.00::numeric,
  'vista, valor manual > 0 ganha ao acordado');
select is((select total from public.contrato_renting_totais where contrato_id = pg_temp.cid(6)), 120.00::numeric,
  'vista, rent-a-car: tarifa_diaria x dias, como antes');
select is((select total from public.contrato_renting_totais where contrato_id = pg_temp.cid(7)), 0.00::numeric,
  'vista, acordado 0 é um preço válido e ganha à tarifa');
select is((select total from public.contrato_renting_totais where contrato_id = pg_temp.cid(8)), 0.00::numeric,
  'vista, TVDE sem preço em lado nenhum: 0, não se inventa preço');

-- ── Congelar ao facturar: os mesmos valores ────────────────

update public.contratos_renting set estado_financeiro = 'facturado'
 where id in (select pg_temp.cid(n) from generate_series(1, 8) n);

select is((select total_final from public.contratos_renting where id = pg_temp.cid(1)), 475.00::numeric,
  'freeze, TVDE sem acordado nem preço na tarifa: preço da tarifa para o modelo');
select is((select total_final from public.contratos_renting where id = pg_temp.cid(2)), 300.00::numeric,
  'freeze, TVDE com acordado: o acordado');
select is((select total_final from public.contratos_renting where id = pg_temp.cid(3)), 390.00::numeric,
  'freeze, TVDE com preço na tarifa: ganha ao preço do modelo');
select is((select total_final from public.contratos_renting where id = pg_temp.cid(4)), 1400.00::numeric,
  'freeze, valor manual de 1400 mantém-se');
select is((select total_final from public.contratos_renting where id = pg_temp.cid(5)), 1400.00::numeric,
  'freeze, valor manual > 0 ganha ao acordado');
select is((select total_final from public.contratos_renting where id = pg_temp.cid(6)), 120.00::numeric,
  'freeze, rent-a-car: tarifa_diaria x dias, como antes');
select is((select total_final from public.contratos_renting where id = pg_temp.cid(7)), 0.00::numeric,
  'freeze, acordado 0 é um preço válido');
select is((select total_final from public.contratos_renting where id = pg_temp.cid(8)), 0.00::numeric,
  'freeze, TVDE sem preço em lado nenhum: 0 como antes');

-- ── fn_aplicar_preco_semana_negociado ──────────────────────

select throws_ok($$ select public.fn_aplicar_preco_semana_negociado(pg_temp.cid(9), null, null) $$,
  'P0001', 'O preço semanal tem de ser um valor igual ou superior a 0.',
  'aplicar: preço nulo é recusado');
select throws_ok($$ select public.fn_aplicar_preco_semana_negociado(pg_temp.cid(9), -1, null) $$,
  'P0001', 'O preço semanal tem de ser um valor igual ou superior a 0.',
  'aplicar: preço negativo é recusado');

select lives_ok(format('select public.fn_aplicar_preco_semana_negociado(pg_temp.cid(%s), 350, null)', n),
  format('aplicar: contrato %s', n))
  from unnest(array[9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25]) as n;

-- Menos de uma semana de idade e nada contado: no próprio sítio, sem versão nova.
select ok(
  not exists (select 1 from public.contratos_renting where contrato_anterior_id = pg_temp.cid(9))
  and (select c.preco_semana_acordado = 350 and c.valor_total_manual = 350 and c.substituido_em is null
         from public.contratos_renting c where c.id = pg_temp.cid(9)),
  'sem nada contado: muda no próprio contrato, sem versão nova; valor igual ao preço da tarifa acompanha');

select ok(
  not exists (select 1 from public.contratos_renting where contrato_anterior_id = pg_temp.cid(10))
  and (select c.preco_semana_acordado = 350 and c.valor_total_manual = 350
              and c.estado_operacional = 'agendado'
         from public.contratos_renting c where c.id = pg_temp.cid(10)),
  'agendado sem nada contado: muda no próprio contrato, valor vazio passa a ser o preço, continua agendado');

select ok(
  not exists (select 1 from public.contratos_renting where contrato_anterior_id = pg_temp.cid(16))
  and (select c.preco_semana_acordado = 350 and c.valor_total_manual = 1400
         from public.contratos_renting c where c.id = pg_temp.cid(16)),
  'no próprio sítio: valor manual de 1400 (renda mensal) fica intacto; o acordado é gravado');

select ok(
  not exists (select 1 from public.contratos_renting where contrato_anterior_id = pg_temp.cid(22))
  and (select c.preco_semana_acordado = 350 and c.valor_total_manual = 200
         from public.contratos_renting c where c.id = pg_temp.cid(22)),
  'sem preço antigo conhecido, o valor do contrato (200) fica intacto');

select ok(
  (select c.preco_semana_acordado = 350 and c.valor_total_manual = 350
         from public.contratos_renting c where c.id = pg_temp.cid(23)),
  'valor manual 0 conta como vazio e passa a ser o preço novo');

-- Versão nova a partir da segunda-feira desta semana.
select ok(
  (select o.substituido_em is not null and o.data_fim = (select desde from semana)
          and o.preco_semana_acordado is null and o.valor_total_manual = 390
     from public.contratos_renting o where o.id = pg_temp.cid(11))
  and (select count(*) = 1 and bool_and(n.data_inicio = (select desde from semana)
          and n.preco_semana_acordado = 350 and n.valor_total_manual = 350
          and n.estado_operacional = 'em_curso' and n.versao = 2)
         from public.contratos_renting n where n.contrato_anterior_id = pg_temp.cid(11)),
  'com semana fechada: versão nova na segunda-feira com o preço novo; a antiga fica com o preço antigo');

select ok(
  (select count(*) = 1 and bool_and(n.preco_semana_acordado = 350 and n.valor_total_manual = 1400)
     from public.contratos_renting n where n.contrato_anterior_id = pg_temp.cid(12)),
  'versão nova: valor manual de 1400 (renda mensal) fica intacto; o acordado é gravado');

select ok(
  (select count(*) = 1 and bool_and(n.preco_semana_acordado = 350 and n.valor_total_manual = 1400)
     from public.contratos_renting n where n.contrato_anterior_id = pg_temp.cid(13)),
  'há 40 dias e sem linhas: não se prova que nenhuma semana fechou, abre versão nova (manual 1400 intacto)');

select ok(
  (select count(*) = 1 and bool_and(n.preco_semana_acordado = 350 and n.valor_total_manual = 350)
     from public.contratos_renting n where n.contrato_anterior_id = pg_temp.cid(14))
  and (select c.preco_semana_acordado is null and c.valor_total_manual = 475
         from public.contratos_renting c where c.id = pg_temp.cid(14)),
  'há 40 dias e sem linhas: versão nova; valor igual ao preço do modelo acompanha, a antiga fica a 475');

select ok(
  (select count(*) = 1 and bool_and(n.preco_semana_acordado = 350 and n.valor_total_manual = 350)
     from public.contratos_renting n where n.contrato_anterior_id = pg_temp.cid(15))
  and (select o.preco_semana_acordado = 330 and o.valor_total_manual = 330
         from public.contratos_renting o where o.id = pg_temp.cid(15)),
  'versão nova: valor igual ao acordado antigo acompanha o preço novo; a antiga fica a 330');

select ok(
  (select count(*) = 1 from public.contratos_renting where contrato_anterior_id = pg_temp.cid(17))
  and (select c.preco_semana_acordado is null from public.contratos_renting c where c.id = pg_temp.cid(17)),
  'condutor com líquido semanal e sem resumo: versão nova, a antiga não muda de preço');

select ok(
  (select count(*) = 1 from public.contratos_renting where contrato_anterior_id = pg_temp.cid(18))
  and (select c.preco_semana_acordado is null from public.contratos_renting c where c.id = pg_temp.cid(18)),
  'renovação com resumo só na versão anterior: versão nova');

select ok(
  (select count(*) = 1 from public.contratos_renting where contrato_anterior_id = pg_temp.cid(21))
  and (select c.preco_semana_acordado is null from public.contratos_renting c where c.id = pg_temp.cid(21)),
  'cobrança semanal de uma semana passada: versão nova');

select ok(
  (select count(*) = 1 from public.contratos_renting where contrato_anterior_id = pg_temp.cid(25)),
  'cobrança de semana passada (contrato 25): versão nova');

select ok(
  not exists (select 1 from public.contratos_renting where contrato_anterior_id = pg_temp.cid(24))
  and (select c.preco_semana_acordado = 350 from public.contratos_renting c where c.id = pg_temp.cid(24)),
  'cobrança só gerada à frente: ainda muda no próprio sítio');

-- data_fim no passado: nunca no próprio sítio; a regra antiga recusa.
select throws_ok(
  $$ select public.fn_aplicar_preco_semana_negociado(pg_temp.cid(20), 350, null) $$,
  '23514', null,
  'data_fim no passado: não muda no próprio sítio, é recusado');

select ok(
  (select c.preco_semana_acordado is null and c.valor_total_manual = 475
     from public.contratos_renting c where c.id = pg_temp.cid(20))
  and not exists (select 1 from public.contratos_renting where contrato_anterior_id = pg_temp.cid(20)),
  'o recusado não deixa rasto no contrato');

-- Depois de aplicado, a vista e o fecho vêem o preço novo.
select is((select total from public.contrato_renting_totais where contrato_id = (select id from public.contratos_renting where contrato_anterior_id = pg_temp.cid(14))), 350.00::numeric,
  'a vista mostra o preço acordado da versão nova depois de aplicado');

-- Regras que se mantêm.
select throws_ok(
  $$ select public.fn_aplicar_preco_semana_negociado(pg_temp.cid(6), 30, null) $$,
  'P0001', 'O preço semanal só se negoceia em contratos TVDE.',
  'rent-a-car continua a não negociar preço semanal');

select throws_ok(
  $$ select public.fn_aplicar_preco_semana_negociado(pg_temp.cid(1), 350, null) $$,
  'P0001', null,
  'contrato facturado continua a recusar o preço novo');

select * from finish();
rollback;
