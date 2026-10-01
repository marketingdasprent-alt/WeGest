-- ============================================================
-- No dia da troca de cartão conta a hora da entrega — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Reproduz o caso do Repsol 0511 (2026-09-23): o cartão passa do Luiz para o
-- Gurbhej, registado às 11:11 UTC (12:11 em Lisboa), e o Gurbhej atesta às
-- 12:23 locais. Ver a migração 20261001100000.
--   (1) antes da hora da entrega, nesse dia → quem entregou;
--   (2) depois → quem recebeu;
--   (3) 11:30 locais fica com quem entregou: a hora da bomba é local e a da
--       entrega é UTC — comparar sem converter dava o titular errado;
--   (4) véspera e dia seguinte seguem as datas;
--   (5) entrega registada dias depois (data recuada): não há hora útil, o dia
--       da troca continua com quem entregou;
--   (6) uma atribuição nova leva o momento do registo;
--   (7) o resolvedor não é executável por anon nem authenticated.
-- ============================================================

begin;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000001900ff', 'bootstrap@entrega-cartao.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000190000', 'Org Entrega Cartao', 'ec-a');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-000000190b01', '00000000-0000-0000-0000-000000190000', 'Quem Entregou'),
  ('00000000-0000-0000-0000-000000190b02', '00000000-0000-0000-0000-000000190000', 'Quem Recebeu'),
  ('00000000-0000-0000-0000-000000190b03', '00000000-0000-0000-0000-000000190000', 'Antigo Tardio'),
  ('00000000-0000-0000-0000-000000190b04', '00000000-0000-0000-0000-000000190000', 'Novo Tardio');

insert into public.cartoes_frota (id, org_id, numero, tipo, status, ativo) values
  ('00000000-0000-0000-0000-000000190c01', '00000000-0000-0000-0000-000000190000', '511', 'repsol', 'em_uso', true),
  ('00000000-0000-0000-0000-000000190c02', '00000000-0000-0000-0000-000000190000', '777', 'repsol', 'em_uso', true);

-- Troca no próprio dia: o período novo começa a 24 (regra das datas), registo a 23 às 11:11 UTC.
insert into public.cartao_atribuicoes (org_id, cartao_id, motorista_id, de, ate, origem, entregue_em) values
  ('00000000-0000-0000-0000-000000190000', '00000000-0000-0000-0000-000000190c01',
   '00000000-0000-0000-0000-000000190b01', '2026-09-01', '2026-09-23', 'associacao', '2026-09-01 08:00+00'),
  ('00000000-0000-0000-0000-000000190000', '00000000-0000-0000-0000-000000190c01',
   '00000000-0000-0000-0000-000000190b02', '2026-09-24', null, 'associacao', '2026-09-23 11:11+00');

-- Troca registada dois dias depois, com a data recuada para 23.
insert into public.cartao_atribuicoes (org_id, cartao_id, motorista_id, de, ate, origem, entregue_em) values
  ('00000000-0000-0000-0000-000000190000', '00000000-0000-0000-0000-000000190c02',
   '00000000-0000-0000-0000-000000190b03', '2026-09-01', '2026-09-23', 'associacao', '2026-09-01 08:00+00'),
  ('00000000-0000-0000-0000-000000190000', '00000000-0000-0000-0000-000000190c02',
   '00000000-0000-0000-0000-000000190b04', '2026-09-24', null, 'associacao', '2026-09-25 10:00+00');

-- Hora da bomba: local, gravada como UTC (como o importador da Repsol faz).
insert into public.repsol_transacoes (org_id, transaction_id, transaction_date, amount, card_number) values
  ('00000000-0000-0000-0000-000000190000', 'ec-antes',   '2026-09-23 12:05+00', 30,  '9724998589690511'),
  ('00000000-0000-0000-0000-000000190000', 'ec-depois',  '2026-09-23 12:23+00', 100, '9724998589690511'),
  ('00000000-0000-0000-0000-000000190000', 'ec-fuso',    '2026-09-23 11:30+00', 20,  '9724998589690511'),
  ('00000000-0000-0000-0000-000000190000', 'ec-vespera', '2026-09-22 20:00+00', 40,  '9724998589690511'),
  ('00000000-0000-0000-0000-000000190000', 'ec-seguinte','2026-09-25 09:00+00', 75,  '9724998589690511'),
  ('00000000-0000-0000-0000-000000190000', 'ec-tardio',  '2026-09-23 15:00+00', 50,  '9724998589690777');

select is(
  (select motorista_id from public.repsol_transacoes where transaction_id = 'ec-antes'),
  '00000000-0000-0000-0000-000000190b01'::uuid,
  '(1) 12:05 locais, antes da entrega das 12:11: fica com quem entregou'
);

select is(
  (select motorista_id from public.repsol_transacoes where transaction_id = 'ec-depois'),
  '00000000-0000-0000-0000-000000190b02'::uuid,
  '(2) 12:23 locais, depois da entrega: vai para quem recebeu (o caso do Gurbhej)'
);

select is(
  (select motorista_id from public.repsol_transacoes where transaction_id = 'ec-fuso'),
  '00000000-0000-0000-0000-000000190b01'::uuid,
  '(3) 11:30 locais é antes das 12:11 de Lisboa, apesar de ser depois das 11:11 UTC'
);

select is(
  (select motorista_id from public.repsol_transacoes where transaction_id = 'ec-vespera'),
  '00000000-0000-0000-0000-000000190b01'::uuid,
  '(4) a véspera segue as datas: quem entregou'
);

select is(
  (select motorista_id from public.repsol_transacoes where transaction_id = 'ec-seguinte'),
  '00000000-0000-0000-0000-000000190b02'::uuid,
  '(4) o dia seguinte segue as datas: quem recebeu'
);

select is(
  (select motorista_id from public.repsol_transacoes where transaction_id = 'ec-tardio'),
  '00000000-0000-0000-0000-000000190b03'::uuid,
  '(5) entrega registada dias depois: o dia da troca fica com quem entregou'
);

-- (6) Atribuição nova sem entregue_em explícito.
insert into public.cartoes_frota (id, org_id, numero, tipo, status, ativo) values
  ('00000000-0000-0000-0000-000000190c03', '00000000-0000-0000-0000-000000190000', '999', 'repsol', 'em_uso', true);
insert into public.cartao_atribuicoes (org_id, cartao_id, motorista_id, de, origem) values
  ('00000000-0000-0000-0000-000000190000', '00000000-0000-0000-0000-000000190c03',
   '00000000-0000-0000-0000-000000190b01', current_date, 'associacao');

select isnt(
  (select entregue_em from public.cartao_atribuicoes
    where cartao_id = '00000000-0000-0000-0000-000000190c03'),
  null,
  '(6) uma atribuição nova leva o momento do registo'
);

select ok(
  not has_function_privilege('anon',
    'public.resolver_titular_por_cartao_em(uuid, text, text, timestamptz)', 'execute'),
  '(7) anon não executa o resolvedor'
);

select ok(
  not has_function_privilege('authenticated',
    'public.resolver_titular_por_cartao_em(uuid, text, text, timestamptz)', 'execute'),
  '(7) authenticated não executa o resolvedor (escolheria outra org)'
);

select ok(
  not has_function_privilege('authenticated', 'public.tg_resolver_motorista_cartao()', 'execute'),
  '(7) o gatilho continua fechado a authenticated'
);

select * from finish();
rollback;
