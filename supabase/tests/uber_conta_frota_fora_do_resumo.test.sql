-- ============================================================
-- "A conta da própria frota não entra no resumo semanal" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- O relatório da Uber traz, além das viagens, a linha do pagamento semanal da
-- Uber à frota: o "motorista" é a empresa, a única coluna preenchida é a da
-- transferência bancária, e o valor é NEGATIVO. O fn_uber_resumo_recalcular
-- criava uma linha de resumo para essa empresa como para qualquer condutor, e
-- semanas inteiras da Década Ousada ficaram com o bruto negativo
-- (-1 488 EUR em 2026-08-17, contra ~10 000 EUR numa semana normal).
--
-- A migração 20260911140000 já marcava a empresa em uber_drivers.is_conta_frota,
-- mas só a escondia do ecrã dos motoristas sem ficha. Este teste fixa a outra
-- metade: a marca também tem de manter a empresa fora dos resumos semanais.
-- ============================================================

begin;
select plan(4);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000160000', 'Org Conta Frota', 'cf-a');

insert into public.plataformas_configuracao (id, org_id, plataforma, nome) values
  ('00000000-0000-0000-0000-000000160b01',
   '00000000-0000-0000-0000-000000160000', 'uber', 'Uber Conta Frota Test');

-- Os dois condutores que o ficheiro traz: uma pessoa e a própria empresa.
-- is_conta_frota fica no valor por omissão (false) — quem o há-de pôr a true é
-- o trg_uber_marcar_conta_frota, a partir das transacções abaixo.
insert into public.uber_drivers (org_id, integracao_id, uber_driver_id, full_name) values
  ('00000000-0000-0000-0000-000000160000', '00000000-0000-0000-0000-000000160b01',
   'cf-motorista-real', 'Ana Condutora'),
  ('00000000-0000-0000-0000-000000160000', '00000000-0000-0000-0000-000000160b01',
   'cf-empresa', 'Org Conta Frota, Lda.');

-- Uma importação real traz as duas linhas no mesmo statement. Interessa que
-- seja assim: o trg_uber_marcar_conta_frota é row-level e o trg_uber_resumo_insert
-- é statement-level, portanto a marca tem de estar posta antes do resumo
-- recalcular. Se a ordem se inverter algum dia, é aqui que rebenta.
insert into public.uber_transactions
  (org_id, integracao_id, uber_transaction_id, uber_driver_id,
   gross_amount, net_amount, occurred_at, raw_transaction)
values
  ('00000000-0000-0000-0000-000000160000', '00000000-0000-0000-0000-000000160b01',
   'cf-tx-motorista', 'cf-motorista-real', 420, 340, '2026-09-02T10:00:00Z',
   jsonb_build_object('csv_row', jsonb_build_object(
     'Nome próprio do motorista', 'Ana',
     'Apelido do motorista', 'Condutora',
     'Pago a si:Os seus rendimentos:Tarifa:Tarifa', '420,00'))),
  ('00000000-0000-0000-0000-000000160000', '00000000-0000-0000-0000-000000160b01',
   'cf-tx-empresa', 'cf-empresa',
   -5327, -5327, '2026-09-02T23:00:00Z',
   jsonb_build_object('csv_row', jsonb_build_object(
     'Nome próprio do motorista', 'Org Conta Frota, Lda.',
     'Apelido do motorista', '',
     'Pago a si:Saldo da viagem:Pagamentos:Transferido para uma conta bancária', '-5327,00')));

-- 1. A cadeia da marcação continua a funcionar. Sem esta asserção, se o
--    trg_uber_marcar_conta_frota deixasse de marcar, os testes 2 e 3 passavam
--    à mesma por outra razão e o teste não valia nada.
select is(
  (select is_conta_frota from public.uber_drivers where uber_driver_id = 'cf-empresa'),
  true,
  'a linha da empresa fica marcada como conta da frota'
);

-- 2. O motorista real entra no resumo, como sempre entrou.
select is(
  (select count(*)::int from public.uber_resumos_semanais
    where integracao_id = '00000000-0000-0000-0000-000000160b01'
      and uber_driver_id = 'cf-motorista-real'),
  1,
  'o motorista real tem a sua linha de resumo semanal'
);

-- 3. A empresa não entra. É isto que a migração 20260914120000 corrige.
select is(
  (select count(*)::int from public.uber_resumos_semanais
    where integracao_id = '00000000-0000-0000-0000-000000160b01'
      and uber_driver_id = 'cf-empresa'),
  0,
  'a conta da frota não gera linha de resumo semanal'
);

-- 4. Não se apaga nada: a transferência continua nas transacções, para quem
--    precisar de reconciliar o que a Uber pagou à empresa.
select is(
  (select count(*)::int from public.uber_transactions
    where uber_transaction_id = 'cf-tx-empresa'),
  1,
  'a transacção da conta da frota continua guardada'
);

select * from finish();
rollback;
