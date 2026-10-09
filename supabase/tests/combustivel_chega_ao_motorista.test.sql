-- ============================================================
-- Todo o combustível chega ao motorista, venha de onde vier — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Em Setembro de 2026 duas fontes deixaram de chegar ao motorista sem ninguém
-- dar por isso: a EDP (o importador não gravava card_number) e a BP por CSV
-- (não ligava bp_cartoes). Fecharam-se semanas sem o desconto. Este teste grava
-- cada fonte como o respectivo importador grava e exige o motorista no fim.
-- Quem mexer no gatilho resolver_motorista ou num importador e partir uma
-- fonte, parte este teste. Ver 20261001150000.
-- ============================================================

begin;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000001c00ff', 'bootstrap@combustivel.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000001c0000', 'Org Combustivel', 'cb-a');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000001c0b01', '00000000-0000-0000-0000-0000001c0000', 'Motorista Repsol'),
  ('00000000-0000-0000-0000-0000001c0b02', '00000000-0000-0000-0000-0000001c0000', 'Motorista EDP'),
  ('00000000-0000-0000-0000-0000001c0b03', '00000000-0000-0000-0000-0000001c0000', 'Motorista BP');

insert into public.plataformas_configuracao (id, org_id, nome, plataforma) values
  ('00000000-0000-0000-0000-0000001c0e01', '00000000-0000-0000-0000-0000001c0000', 'Repsol', 'repsol'),
  ('00000000-0000-0000-0000-0000001c0e02', '00000000-0000-0000-0000-0000001c0000', 'EDP', 'edp'),
  ('00000000-0000-0000-0000-0000001c0e03', '00000000-0000-0000-0000-0000001c0000', 'BP', 'bp');

insert into public.cartoes_frota (id, org_id, numero, tipo, status, ativo) values
  ('00000000-0000-0000-0000-0000001c0c01', '00000000-0000-0000-0000-0000001c0000', '511', 'repsol', 'em_uso', true),
  ('00000000-0000-0000-0000-0000001c0c02', '00000000-0000-0000-0000-0000001c0000', '5000000000027228', 'edp', 'em_uso', true),
  ('00000000-0000-0000-0000-0000001c0c03', '00000000-0000-0000-0000-0000001c0000', '154', 'bp', 'em_uso', true);

insert into public.cartao_atribuicoes (org_id, cartao_id, motorista_id, de, ate, origem, entregue_em) values
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0c01',
   '00000000-0000-0000-0000-0000001c0b01', '2026-09-01', null, 'associacao', '2026-09-01 08:00+00'),
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0c02',
   '00000000-0000-0000-0000-0000001c0b02', '2026-09-01', null, 'associacao', '2026-09-01 08:00+00'),
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0c03',
   '00000000-0000-0000-0000-0000001c0b03', '2026-09-01', null, 'associacao', '2026-09-01 08:00+00');

-- Repsol, como o repsol-import-csv grava: card_number com o PAN.
insert into public.repsol_transacoes (org_id, integracao_id, transaction_id, transaction_date, amount, card_number) values
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0e01',
   'cb-repsol', '2026-09-10 10:00+00', 50, '9724998589690511');
select is(
  (select motorista_id from public.repsol_transacoes where transaction_id = 'cb-repsol'),
  '00000000-0000-0000-0000-0000001c0b01'::uuid,
  'Repsol: o abastecimento chega ao motorista'
);

-- EDP, como o edp-import-csv grava agora: card_number preenchido.
insert into public.edp_transacoes (org_id, integracao_id, transaction_id, transaction_date, amount, card_number) values
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0e02',
   'edp-5000000000027228-20260910100000', '2026-09-10 10:00+00', 12, '5000000000027228');
select is(
  (select motorista_id from public.edp_transacoes where transaction_id = 'edp-5000000000027228-20260910100000'),
  '00000000-0000-0000-0000-0000001c0b02'::uuid,
  'EDP: o carregamento chega ao motorista'
);

-- EDP, como o importador gravava até hoje: sem card_number.
insert into public.edp_transacoes (org_id, integracao_id, transaction_id, transaction_date, amount) values
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0e02',
   'edp-5000000000027228-20260911100000', '2026-09-11 10:00+00', 14);
select is(
  (select motorista_id from public.edp_transacoes where transaction_id = 'edp-5000000000027228-20260911100000'),
  '00000000-0000-0000-0000-0000001c0b02'::uuid,
  'EDP sem card_number: o número sai do transaction_id e chega ao motorista'
);
select is(
  (select card_number from public.edp_transacoes where transaction_id = 'edp-5000000000027228-20260911100000'),
  '5000000000027228',
  'EDP sem card_number: o número fica gravado'
);

-- BP por CSV, como o bp-import-csv grava agora: cartão em bp_cartoes.
insert into public.bp_cartoes (id, org_id, integracao_id, card_id, card_number) values
  ('00000000-0000-0000-0000-0000001c0d01', '00000000-0000-0000-0000-0000001c0000',
   '00000000-0000-0000-0000-0000001c0e03', 'csv:154', '154');
insert into public.bp_transacoes (org_id, integracao_id, transaction_id, transaction_date, amount, card_id) values
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0e03',
   'bp-154-010920261026', '2026-09-10 10:00+00', 30, '00000000-0000-0000-0000-0000001c0d01');
select is(
  (select motorista_id from public.bp_transacoes where transaction_id = 'bp-154-010920261026'),
  '00000000-0000-0000-0000-0000001c0b03'::uuid,
  'BP por CSV: o abastecimento chega ao motorista'
);

-- BP como o importador gravava até hoje: sem card_id, número só no ficheiro.
insert into public.bp_transacoes (org_id, integracao_id, transaction_id, transaction_date, amount, raw_data) values
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0e03',
   'x-sem-cartao-1', '2026-09-11 10:00+00', 20, '{"Nº cartão": "154"}');
select is(
  (select motorista_id from public.bp_transacoes where transaction_id = 'x-sem-cartao-1'),
  '00000000-0000-0000-0000-0000001c0b03'::uuid,
  'BP sem card_id: o número do ficheiro chega ao motorista'
);

-- O Excel grava o número como decimal: conta a parte inteira (154, não 1540).
insert into public.bp_transacoes (org_id, integracao_id, transaction_id, transaction_date, amount, raw_data) values
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0e03',
   'x-sem-cartao-2', '2026-09-12 10:00+00', 20, '{"Nº cartão": "154,0"}');
select is(
  (select motorista_id from public.bp_transacoes where transaction_id = 'x-sem-cartao-2'),
  '00000000-0000-0000-0000-0000001c0b03'::uuid,
  'BP com "154,0": conta o cartão 154'
);

-- Só com o transaction_id ("bp-<cartão>-<data>").
insert into public.bp_transacoes (org_id, integracao_id, transaction_id, transaction_date, amount) values
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0e03',
   'bp-154-130920261200', '2026-09-13 12:00+00', 25);
select is(
  (select motorista_id from public.bp_transacoes where transaction_id = 'bp-154-130920261200'),
  '00000000-0000-0000-0000-0000001c0b03'::uuid,
  'BP só com transaction_id: chega ao motorista'
);

-- BP pela API: bp_cartoes com o PAN completo.
insert into public.bp_cartoes (id, org_id, integracao_id, card_id, card_number) values
  ('00000000-0000-0000-0000-0000001c0d02', '00000000-0000-0000-0000-0000001c0000',
   '00000000-0000-0000-0000-0000001c0e03', 'api-1', '7077881234560154');
insert into public.bp_transacoes (org_id, integracao_id, transaction_id, transaction_date, amount, card_id) values
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0e03',
   'api-tx-1', '2026-09-14 10:00+00', 40, '00000000-0000-0000-0000-0000001c0d02');
select is(
  (select motorista_id from public.bp_transacoes where transaction_id = 'api-tx-1'),
  '00000000-0000-0000-0000-0000001c0b03'::uuid,
  'BP pela API: chega ao motorista'
);

-- Cartão que ninguém tem: fica sem dono, nunca vai para outro.
insert into public.edp_transacoes (org_id, integracao_id, transaction_id, transaction_date, amount, card_number) values
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0e02',
   'edp-5000000000099999-20260910100000', '2026-09-10 10:00+00', 9, '5000000000099999');
select is(
  (select motorista_id from public.edp_transacoes where transaction_id = 'edp-5000000000099999-20260910100000'),
  null::uuid,
  'cartão sem titular fica sem dono (não é imputado a ninguém por engano)'
);

-- Quem paga é o dono do cartão nessa data, e só ele. A matrícula do ficheiro
-- (digitada na bomba) e qualquer motorista que a linha traga não contam: a
-- 01/10/2026 um "BM52OQ" em vez de "BM53OQ" apontou para o carro de outro.
insert into public.repsol_transacoes
  (org_id, integracao_id, transaction_id, transaction_date, amount, card_number, motorista_id, raw_data) values
  ('00000000-0000-0000-0000-0000001c0000', '00000000-0000-0000-0000-0000001c0e01',
   'cb-repsol-matricula-de-outro', '2026-10-01 19:19+00', 86.28, '9724998589690511',
   '00000000-0000-0000-0000-0000001c0b02',
   '{"MATRÍCULA/CONDUTOR TICKET": "BM52OQ", "CONDUTOR": "Motorista EDP"}'::jsonb);
select is(
  (select motorista_id from public.repsol_transacoes where transaction_id = 'cb-repsol-matricula-de-outro'),
  '00000000-0000-0000-0000-0000001c0b01'::uuid,
  'o cartão decide quem paga: a matrícula e o motorista que vêm na linha não contam'
);

select * from finish();
rollback;
