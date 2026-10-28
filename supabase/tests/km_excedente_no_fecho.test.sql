-- ============================================================
-- Km extra no fecho e na renovação — pelo canal do regime
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Rent-a-car cobra-se na fatura do contrato (linha nos extras); TVDE na
-- conta-corrente do motorista (débito). No fecho é um trigger, para apanhar
-- qualquer caminho (ecrã, QR) e reverter. As provas defendem, por ordem:
--   * fechar cobra pelo canal certo, corrigir o km recalcula, reverter retira;
--   * "não cobrar" do gestor, km de saída 0, contratos já fechados antes da
--     regra e versões substituídas não cobram;
--   * débito já pago não se mexe; versão nova não herda a escolha;
--   * a renovação TVDE debita em vez de lançar linha;
--   * a RPC recusa outra org e quem não tem acesso; a interna não é exposta.
-- ============================================================

begin;
select plan(27);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação".
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000ea1ff', 'bootstrap@kmexc.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000ea000', 'Org Km A', 'kmexc-a'),
  ('00000000-0000-0000-0000-0000000eb000', 'Org Km B', 'kmexc-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000ea101', 'admin@kmexc.pt'),
  ('00000000-0000-0000-0000-0000000ea102', 'semacesso@kmexc.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000ea101', '00000000-0000-0000-0000-0000000ea000'),
  ('00000000-0000-0000-0000-0000000ea102', '00000000-0000-0000-0000-0000000ea000');

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-0000000ec102', 'Sem contratos', '00000000-0000-0000-0000-0000000ea000');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000000ea101', '00000000-0000-0000-0000-0000000ea000', true, null),
  ('00000000-0000-0000-0000-0000000ea102', '00000000-0000-0000-0000-0000000ea000', false, '00000000-0000-0000-0000-0000000ec102')
on conflict (user_id, org_id) do update
  set is_admin = excluded.is_admin, cargo_id = excluded.cargo_id;

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000eaa01', '00000000-0000-0000-0000-0000000ea000', 'Opel'),
  ('00000000-0000-0000-0000-0000000eab01', '00000000-0000-0000-0000-0000000eb000', 'Opel');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000000ed001', '00000000-0000-0000-0000-0000000ea000',
   '00000000-0000-0000-0000-0000000eaa01', 'Astra'),
  ('00000000-0000-0000-0000-0000000edb01', '00000000-0000-0000-0000-0000000eb000',
   '00000000-0000-0000-0000-0000000eab01', 'Corsa');

-- Uma viatura, uma reserva e um contrato por caso (sufixo 1..6 na org A, b1 na B).
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id)
select ('00000000-0000-0000-0000-0000000ee00' || n)::uuid, '00000000-0000-0000-0000-0000000ea000',
       'KM-0' || n || '-AA', '00000000-0000-0000-0000-0000000eaa01', '00000000-0000-0000-0000-0000000ed001'
  from generate_series(1, 6) n;
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-0000000eeb01', '00000000-0000-0000-0000-0000000eb000', 'KM-01-BB',
   '00000000-0000-0000-0000-0000000eab01', '00000000-0000-0000-0000-0000000edb01');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000ef001', '00000000-0000-0000-0000-0000000ea000', 'Cliente Km A'),
  ('00000000-0000-0000-0000-0000000efb01', '00000000-0000-0000-0000-0000000eb000', 'Cliente Km B');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000e1101', '00000000-0000-0000-0000-0000000ea000', 'Motorista Km');

-- reserva_id é NOT NULL: cada contrato precisa da sua reserva.
insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado)
select ('00000000-0000-0000-0000-0000000ec40' || n)::uuid, '00000000-0000-0000-0000-0000000ea000', 980000 + n,
       '2026-10-01T10:00:00Z', ('00000000-0000-0000-0000-0000000ee00' || n)::uuid,
       '00000000-0000-0000-0000-0000000ef001', 'concluida'
  from generate_series(1, 6) n;
insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado) values
  ('00000000-0000-0000-0000-0000000ec4b1', '00000000-0000-0000-0000-0000000eb000', 980099,
   '2026-10-01T10:00:00Z', '00000000-0000-0000-0000-0000000eeb01', '00000000-0000-0000-0000-0000000efb01', 'concluida');

-- created_by: a trigger de abertura cria o evento de entrega com criado_por NOT NULL.
-- Todos fizeram 2 500 km com 2 000 incluídos, salvo onde se diz.
insert into public.contratos_renting
  (id, org_id, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao,
   kms_incluidos, km_adicional_valor, km_saida, km_entrada, created_by)
select ('00000000-0000-0000-0000-0000000ec00' || n)::uuid, '00000000-0000-0000-0000-0000000ea000',
       ('00000000-0000-0000-0000-0000000ec40' || n)::uuid, '00000000-0000-0000-0000-0000000ef001',
       ('00000000-0000-0000-0000-0000000ee00' || n)::uuid, 'KM-0' || n || '-AA',
       '2026-10-01T10:00:00Z', case when regime = 'tvde' then null else '2026-10-31T10:00:00Z'::timestamptz end,
       estado::contrato_estado_operacional_enum, 'pendente', regime::contrato_regime_enum, 23, false,
       2000, valor_km, km_saida, 12500, '00000000-0000-0000-0000-0000000ea101'
  from (values
    (1, 'rent_a_car', 0.125, 10000, 'em_curso'),  -- R1: rent-a-car, 500 km × 0,125 = 62,50 €
    (2, 'tvde',       0.20,  10000, 'em_curso'),  -- T1: TVDE com motorista, 100,00 €
    (3, 'tvde',       0.20,  10000, 'em_curso'),  -- T2: TVDE sem motorista
    (4, 'rent_a_car', 0.125, 0,     'em_curso'),  -- R2: km de saída por registar
    (5, 'rent_a_car', 0.125, 10000, 'fechado'),   -- V: fechou antes desta regra
    (6, 'rent_a_car', 0.125, 10000, 'em_curso')   -- R3: vai ser substituído
  ) as t(n, regime, valor_km, km_saida, estado);

insert into public.contratos_renting
  (id, org_id, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao,
   kms_incluidos, km_adicional_valor, km_saida, km_entrada, created_by)
values
  ('00000000-0000-0000-0000-0000000ec0b1', '00000000-0000-0000-0000-0000000eb000',
   '00000000-0000-0000-0000-0000000ec4b1', '00000000-0000-0000-0000-0000000efb01',
   '00000000-0000-0000-0000-0000000eeb01', 'KM-01-BB', '2026-10-01T10:00:00Z', '2026-10-31T10:00:00Z',
   'em_curso', 'pendente', 'rent_a_car', 23, false,
   2000, 0.125, 10000, 12500, '00000000-0000-0000-0000-0000000ea101');

insert into public.contrato_condutores (org_id, contrato_id, motorista_id, is_principal) values
  ('00000000-0000-0000-0000-0000000ea000', '00000000-0000-0000-0000-0000000ec002',
   '00000000-0000-0000-0000-0000000e1101', true);

create function pg_temp.linhas(p_contrato uuid) returns int language sql as $$
  select count(*)::int from public.contrato_extras
   where contrato_id = p_contrato and extra_nome like 'Km excedente%';
$$;
create function pg_temp.debito(p_ref text) returns numeric language sql as $$
  select sum(valor) from public.motorista_financeiro where referencia = p_ref;
$$;

-- ── Grants ─────────────────────────────────────────────────

select ok(not has_function_privilege('anon', 'public.lancar_km_excedente_fecho(uuid, boolean)', 'EXECUTE'),
  'anon não executa a RPC do fecho');
select ok(has_function_privilege('authenticated', 'public.lancar_km_excedente_fecho(uuid, boolean)', 'EXECUTE'),
  'authenticated executa a RPC do fecho');
select ok(not has_function_privilege('authenticated',
  'public.km_excedente_cobrar(public.contratos_renting, integer, integer, text)', 'EXECUTE'),
  'a função que lança não está exposta à API');

-- ── Administrador da org A ─────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ea101', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ea101","role":"authenticated"}', true);

select is(
  public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec001'),
  '{"km_percorridos": 2500, "km_excedente": 500, "valor_previsto": 62.50}'::jsonb,
  'a RPC mostra a previsão — sem a chave valor, que o frontend antigo debitava'
);
select is(pg_temp.linhas('00000000-0000-0000-0000-0000000ec001'), 0,
  'antes de fechar não se lança nada');

-- Rent-a-car: linha nos extras.
update public.contratos_renting set estado_operacional = 'fechado'
 where id = '00000000-0000-0000-0000-0000000ec001';

select results_eq(
  $$ select extra_nome, preco_unidade, quantidade, total from public.contrato_extras
      where contrato_id = '00000000-0000-0000-0000-0000000ec001' $$,
  $$ values ('Km excedente no fecho (500 km × 0.125 €)'::text, 62.50::numeric, 1, 62.50::numeric) $$,
  'rent-a-car fechado: linha nos extras com o total exacto'
);
select ok(
  (select km_excedente_avaliado_em is not null from public.contratos_renting
    where id = '00000000-0000-0000-0000-0000000ec001'),
  'o fecho fica marcado como avaliado'
);

update public.contratos_renting set km_entrada = 12600
 where id = '00000000-0000-0000-0000-0000000ec001';
select is(
  (select total from public.contrato_extras where contrato_id = '00000000-0000-0000-0000-0000000ec001'),
  75.00::numeric,
  'corrigir o km depois de fechado recalcula (600 km → 75,00 €)'
);
select is(pg_temp.linhas('00000000-0000-0000-0000-0000000ec001'), 1, 'e continua a haver uma linha só');

update public.contratos_renting set estado_operacional = 'em_curso'
 where id = '00000000-0000-0000-0000-0000000ec001';
select is(pg_temp.linhas('00000000-0000-0000-0000-0000000ec001'), 0, 'reverter o fecho retira a linha');

select lives_ok(
  $$ select public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec001', false) $$,
  'o gestor escolhe não cobrar'
);
update public.contratos_renting set estado_operacional = 'fechado'
 where id = '00000000-0000-0000-0000-0000000ec001';
select is(pg_temp.linhas('00000000-0000-0000-0000-0000000ec001'), 0, 'e o fecho não lança nada');

select lives_ok(
  $$ select public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec001', true) $$,
  'mudar de ideias com o contrato já fechado'
);
select is(pg_temp.linhas('00000000-0000-0000-0000-0000000ec001'), 1, 'lança na hora');

-- TVDE: débito na conta-corrente do motorista, sem linha.
update public.contratos_renting set estado_operacional = 'fechado', data_fim = now()
 where id = '00000000-0000-0000-0000-0000000ec002';

select is(
  (select string_agg(format('%s|%s|%s|%s|%s', motorista_id, tipo, status, valor, descricao), ';')
     from public.motorista_financeiro
    where referencia = 'km_excedente_fecho:00000000-0000-0000-0000-0000000ec002'),
  format('00000000-0000-0000-0000-0000000e1101|debito|pendente|100.00|Km extra no fecho do contrato #%s (500 km × 0.2 €)',
         (select codigo from public.contratos_renting where id = '00000000-0000-0000-0000-0000000ec002')),
  'TVDE fechado: débito pendente ao motorista'
);
select is(pg_temp.linhas('00000000-0000-0000-0000-0000000ec002'), 0, 'e nenhuma linha no contrato');

update public.motorista_financeiro set status = 'pago', data_pagamento = current_date
 where referencia = 'km_excedente_fecho:00000000-0000-0000-0000-0000000ec002';
update public.contratos_renting set km_entrada = 13000
 where id = '00000000-0000-0000-0000-0000000ec002';
select is(pg_temp.debito('km_excedente_fecho:00000000-0000-0000-0000-0000000ec002'), 100.00::numeric,
  'débito já pago não é mexido nem duplicado');

update public.contratos_renting set estado_operacional = 'fechado', data_fim = now()
 where id = '00000000-0000-0000-0000-0000000ec003';
select is(pg_temp.linhas('00000000-0000-0000-0000-0000000ec003'), 1,
  'TVDE sem motorista: fica a linha no contrato, para não se perder');

update public.contratos_renting set estado_operacional = 'fechado'
 where id = '00000000-0000-0000-0000-0000000ec004';
select is(pg_temp.linhas('00000000-0000-0000-0000-0000000ec004'), 0,
  'km de saída 0 conta como não registado — não cobra');

update public.contratos_renting set km_entrada = 13000
 where id = '00000000-0000-0000-0000-0000000ec005';
select is(pg_temp.linhas('00000000-0000-0000-0000-0000000ec005'), 0,
  'contrato fechado antes desta regra não é cobrado, mesmo mexendo no km');

update public.contratos_renting set estado_operacional = 'fechado', substituido_em = now()
 where id = '00000000-0000-0000-0000-0000000ec006';
select is(pg_temp.linhas('00000000-0000-0000-0000-0000000ec006'), 0,
  'versão substituída (renovação) não leva a cobrança do fecho');

-- Versão nova copiada da antiga não herda a escolha nem a avaliação.
insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado) values
  ('00000000-0000-0000-0000-0000000ec407', '00000000-0000-0000-0000-0000000ea000', 980007,
   '2026-11-01T10:00:00Z', '00000000-0000-0000-0000-0000000ee006', '00000000-0000-0000-0000-0000000ef001', 'concluida');
insert into public.contratos_renting
  (id, org_id, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao,
   cobrar_km_excedente, km_excedente_avaliado_em, created_by)
values
  ('00000000-0000-0000-0000-0000000ec007', '00000000-0000-0000-0000-0000000ea000',
   '00000000-0000-0000-0000-0000000ec407', '00000000-0000-0000-0000-0000000ef001',
   '00000000-0000-0000-0000-0000000ee006', 'KM-06-AA', '2026-11-01T10:00:00Z', '2026-11-30T10:00:00Z',
   'em_curso', 'pendente', 'rent_a_car', 23, false,
   false, now(), '00000000-0000-0000-0000-0000000ea101');
select results_eq(
  $$ select cobrar_km_excedente, km_excedente_avaliado_em from public.contratos_renting
      where id = '00000000-0000-0000-0000-0000000ec007' $$,
  $$ values (true, null::timestamptz) $$,
  'contrato novo começa a cobrar e por avaliar'
);

-- Renovação TVDE: mesma função, débito em vez de linha.
select is(
  public.km_excedente_cobrar(
    (select c from public.contratos_renting c where id = '00000000-0000-0000-0000-0000000ec002'),
    10000, 13000, 'renovacao') ->> 'canal',
  'conta_corrente',
  'na renovação um TVDE também vai para a conta-corrente'
);
select is(pg_temp.debito('km_excedente_renovacao:00000000-0000-0000-0000-0000000ec002'), 200.00::numeric,
  'com o valor do ciclo (1 000 km × 0,20 €)');

select throws_ok(
  $$ select public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec0b1') $$,
  '42501', null,
  'um contrato de outra org é recusado'
);

-- ── Utilizador sem acesso a contratos ──────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ea102', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ea102","role":"authenticated"}', true);

select throws_ok(
  $$ select public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec001', false) $$,
  '42501', null,
  'sem a permissão renting_contratos é recusado'
);
select is(pg_temp.linhas('00000000-0000-0000-0000-0000000ec001'), 1,
  'e a escolha não mudou');

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
