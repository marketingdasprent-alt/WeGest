-- ============================================================
-- BP rejeitada fora das contas: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Caso Adair Pinheiro (06/10/2026): um abastecimento com Status "Rejeitada"
-- entrava em bp_transacoes e era somado ao combustível. Ver a migração
-- 20261006120000. Provas:
--   (1) rejeitada não fica guardada (INSERT, e upsert que a reescreve);
--   (2) aceite e "aceite com alerta" ficam;
--   (3) a soma do combustível do motorista (o que o extrato lê) só tem os aceites;
--   (4) o gatilho não é chamável por quem não é dono.
-- ============================================================

begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000006b00ff', 'bootstrap@bp-rejeitadas.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000006b0000', 'Org BP Rejeitadas', 'bp-rejeitadas');

insert into public.plataformas_configuracao (id, org_id, nome, plataforma) values
  ('00000000-0000-0000-0000-0000006b0a01', '00000000-0000-0000-0000-0000006b0000', 'BP', 'bp');

insert into public.motoristas_ativos (id, org_id, nome, status_ativo) values
  ('00000000-0000-0000-0000-0000006b0d01', '00000000-0000-0000-0000-0000006b0000', 'Motorista BP', true);

-- O gatilho do titular reatribuía o motorista ao inserir; aqui o motorista vai à mão.
alter table public.bp_transacoes disable trigger resolver_motorista;

-- ── (1) Rejeitada não fica ─────────────────────────────────

insert into public.bp_transacoes
  (integracao_id, org_id, transaction_id, transaction_date, amount, motorista_id, raw_data)
values
  ('00000000-0000-0000-0000-0000006b0a01', '00000000-0000-0000-0000-0000006b0000', 'rej-1',
   timestamptz '2026-09-28 19:24+00', 90.02, '00000000-0000-0000-0000-0000006b0d01',
   '{"Status": "Rejeitada", "Resultado Obtido": "Ultrapassado limite de plafond"}');

select is(
  (select count(*)::int from public.bp_transacoes where transaction_id = 'rej-1'),
  0,
  'abastecimento rejeitado não fica guardado'
);

-- ── (2) Aceites ficam ──────────────────────────────────────

insert into public.bp_transacoes
  (integracao_id, org_id, transaction_id, transaction_date, amount, motorista_id, raw_data)
values
  ('00000000-0000-0000-0000-0000006b0a01', '00000000-0000-0000-0000-0000006b0000', 'ok-1',
   timestamptz '2026-09-25 22:25+00', 98.56, '00000000-0000-0000-0000-0000006b0d01',
   '{"Status": "Aceite c/ Alerta"}'),
  ('00000000-0000-0000-0000-0000006b0a01', '00000000-0000-0000-0000-0000006b0000', 'ok-2',
   timestamptz '2026-10-01 20:35+00', 90.11, '00000000-0000-0000-0000-0000006b0d01',
   '{"Status": "Aceite"}'),
  -- Sem estado (linhas da API antiga): continua a entrar.
  ('00000000-0000-0000-0000-0000006b0a01', '00000000-0000-0000-0000-0000006b0000', 'ok-3',
   timestamptz '2026-10-02 10:00+00', 10.00, '00000000-0000-0000-0000-0000006b0d01',
   '{}');

select is(
  (select count(*)::int from public.bp_transacoes where transaction_id like 'ok-%'),
  3,
  'aceite, aceite com alerta e sem estado ficam'
);

-- ── Upsert: uma linha aceite que passa a rejeitada deixa de contar ──

select lives_ok(
  $$ insert into public.bp_transacoes
       (integracao_id, org_id, transaction_id, transaction_date, amount, raw_data)
     values
       ('00000000-0000-0000-0000-0000006b0a01', '00000000-0000-0000-0000-0000006b0000', 'rej-2',
        timestamptz '2026-09-29 10:00+00', 50, '{"Status": "Rejeitada"}')
     on conflict (integracao_id, transaction_id) do update set amount = excluded.amount $$,
  'upsert de uma rejeitada não rebenta'
);

select is(
  (select count(*)::int from public.bp_transacoes where transaction_id = 'rej-2'),
  0,
  'e também não fica guardada'
);

alter table public.bp_transacoes enable trigger resolver_motorista;

-- ── (3) A soma do combustível só tem os aceites ────────────

select is(
  (select sum(amount) from public.bp_transacoes
    where motorista_id = '00000000-0000-0000-0000-0000006b0d01'
      and transaction_date >= timestamptz '2026-09-28 00:00+00'
      and transaction_date <  timestamptz '2026-10-05 00:00+00'),
  100.11::numeric,
  'combustível da semana 28/09 a 04/10 = 90,11 + 10,00, sem os 90,02 rejeitados'
);

-- ── (4) Grants ─────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.fn_bp_descarta_rejeitada()', 'EXECUTE'),
  'anon não executa o gatilho'
);

select * from finish();
rollback;
