-- ============================================================
-- Repsol: chave sem valor e limpeza dos repetidos: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Caso Alysson (cartão 2459, 28/09/2026): a mesma compra veio a 40,00 € e, na
-- reimportação de 06/10, a 39,65 €; a chave levava o valor e ficaram as duas,
-- somadas no resumo. Ver a migração 20261006130000. Provas:
--   (1) a chave nova só tira o valor (e marca a devolução);
--   (2) o par em semana aberta fica só com a linha mais recente, na chave nova,
--       e a antiga vai para a cópia de segurança;
--   (3) o par em semana já paga fica como está (as duas), só a mais recente
--       muda de chave;
--   (4) compra e devolução do mesmo minuto e litros não se colam;
--   (5) formatos antigos não se tocam;
--   (6) repetir a função não colide nem apaga mais nada;
--   (7) só o dono da base chama a limpeza.
-- ============================================================

begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000007c00ff', 'bootstrap@repsol-chave.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000007c0000', 'Org Repsol Chave', 'repsol-chave');

insert into public.plataformas_configuracao (id, org_id, nome, plataforma) values
  ('00000000-0000-0000-0000-0000007c0a01', '00000000-0000-0000-0000-0000007c0000', 'Repsol', 'repsol');

insert into public.motoristas_ativos (id, org_id, nome, status_ativo) values
  ('00000000-0000-0000-0000-0000007c0d01', '00000000-0000-0000-0000-0000007c0000', 'Alysson Teste', true),
  ('00000000-0000-0000-0000-0000007c0d02', '00000000-0000-0000-0000-0000007c0000', 'Pago Teste', true);

-- O gatilho do titular reatribuía o motorista ao inserir; aqui o motorista vai à mão.
alter table public.repsol_transacoes disable trigger resolver_motorista;

insert into public.repsol_transacoes
  (integracao_id, org_id, transaction_id, transaction_date, amount, quantity, card_number, motorista_id, created_at)
values
  -- A: semana aberta. Antiga a 40,00, recente a 39,65.
  ('00000000-0000-0000-0000-0000007c0a01', '00000000-0000-0000-0000-0000007c0000',
   'repsol-9724998589692459-20260928074800-40.00-17.36', timestamptz '2026-09-28 07:48+00', 40, 17.36,
   '9724998589692459', '00000000-0000-0000-0000-0000007c0d01', timestamptz '2026-09-28 08:34+00'),
  ('00000000-0000-0000-0000-0000007c0a01', '00000000-0000-0000-0000-0000007c0000',
   'repsol-9724998589692459-20260928074800-39.65-17.36', timestamptz '2026-09-28 07:48+00', 39.65, 17.36,
   '9724998589692459', '00000000-0000-0000-0000-0000007c0d01', timestamptz '2026-10-06 14:39+00'),
  -- B: semana paga (07/09). As duas ficam.
  ('00000000-0000-0000-0000-0000007c0a01', '00000000-0000-0000-0000-0000007c0000',
   'repsol-9724998589690511-20260908090000-100.00-42.57', timestamptz '2026-09-08 09:00+00', 100, 42.57,
   '9724998589690511', '00000000-0000-0000-0000-0000007c0d02', timestamptz '2026-09-09 08:00+00'),
  ('00000000-0000-0000-0000-0000007c0a01', '00000000-0000-0000-0000-0000007c0000',
   'repsol-9724998589690511-20260908090000-99.15-42.57', timestamptz '2026-09-08 09:00+00', 99.15, 42.57,
   '9724998589690511', '00000000-0000-0000-0000-0000007c0d02', timestamptz '2026-10-06 14:39+00'),
  -- C: compra e devolução do mesmo minuto e litros.
  ('00000000-0000-0000-0000-0000007c0a01', '00000000-0000-0000-0000-0000007c0000',
   'repsol-9724998589690999-20260910120000-100.00-42.57', timestamptz '2026-09-10 12:00+00', 100, 42.57,
   '9724998589690999', null, timestamptz '2026-10-06 14:39+00'),
  ('00000000-0000-0000-0000-0000007c0a01', '00000000-0000-0000-0000-0000007c0000',
   'repsol-9724998589690999-20260910120000--100.00-42.57', timestamptz '2026-09-10 12:00+00', -100, 42.57,
   '9724998589690999', null, timestamptz '2026-10-06 14:39+00'),
  -- D: formato antigo, fora do alvo.
  ('00000000-0000-0000-0000-0000007c0a01', '00000000-0000-0000-0000-0000007c0000',
   'repsol-9724998565240448-10042026-11113-49680-escoimbraenst-', timestamptz '2026-04-10 00:00+00', 111.13, 49.68,
   '9724998565240448', null, timestamptz '2026-05-11 08:00+00');

alter table public.repsol_transacoes enable trigger resolver_motorista;

-- Semana de 07/09 do motorista B já foi paga.
insert into public.relatorio_pagamento_pagos (org_id, motorista_id, semana_inicio) values
  ('00000000-0000-0000-0000-0000007c0000', '00000000-0000-0000-0000-0000007c0d02', date '2026-09-07');

-- ── (1) A chave nova ───────────────────────────────────────

select is(
  public.repsol_chave_sem_valor('repsol-9724998589692459-20260928074800-39.65-17.36'),
  'repsol-9724998589692459-20260928074800-17.36',
  'tira o valor da chave'
);

select is(
  public.repsol_chave_sem_valor('repsol-9724998589690999-20260910120000--100.00-42.57'),
  'repsol-9724998589690999-20260910120000-42.57-dev',
  'e marca a devolução'
);

select is(
  public.repsol_chave_sem_valor('repsol-9724998565240448-10042026-11113-49680-escoimbraenst-'),
  'repsol-9724998565240448-10042026-11113-49680-escoimbraenst-',
  'formatos antigos ficam iguais'
);

-- ── A limpeza ──────────────────────────────────────────────

create temporary table _r as select * from public.repsol_limpar_valor_na_chave();

select is((select apagadas from _r), 1, 'apaga 1: a antiga do par em semana aberta');
select is((select reescritas from _r), 4, 'reescreve 4 chaves: a recente de A, a recente de B, e a compra e a devolução de C');
select is((select ficaram_semana_paga from _r), 1, 'e 1 repetida ficou por estar em semana paga');

-- ── (2) Semana aberta ──────────────────────────────────────

select is(
  (select amount from public.repsol_transacoes
    where transaction_id = 'repsol-9724998589692459-20260928074800-17.36'),
  39.65::numeric,
  'fica só a linha mais recente (39,65), na chave nova'
);

select is(
  (select count(*)::int from public.repsol_transacoes where card_number = '9724998589692459'),
  1,
  'e é a única do cartão 2459 nesse minuto'
);

select is(
  (select count(*)::int from public.repsol_duplicados_removidos_20261006
    where transaction_id = 'repsol-9724998589692459-20260928074800-40.00-17.36'),
  1,
  'a antiga ficou na cópia de segurança'
);

-- ── (3) Semana paga ────────────────────────────────────────

select is(
  (select count(*)::int from public.repsol_transacoes where card_number = '9724998589690511'),
  2,
  'em semana paga as duas ficam'
);

select is(
  (select amount from public.repsol_transacoes
    where transaction_id = 'repsol-9724998589690511-20260908090000-42.57'),
  99.15::numeric,
  'e só a mais recente passa à chave nova'
);

-- ── (4) Devolução ──────────────────────────────────────────

select is(
  (select count(*)::int from public.repsol_transacoes where card_number = '9724998589690999'),
  2,
  'compra e devolução do mesmo minuto continuam as duas'
);

-- ── (5) Formato antigo ─────────────────────────────────────

select is(
  (select count(*)::int from public.repsol_transacoes
    where transaction_id = 'repsol-9724998565240448-10042026-11113-49680-escoimbraenst-'),
  1,
  'o formato antigo não foi tocado'
);

-- ── (6) Repetir ────────────────────────────────────────────

select lives_ok(
  $$ select * from public.repsol_limpar_valor_na_chave() $$,
  'segunda passagem não colide'
);

select is(
  (select count(*)::int from public.repsol_transacoes
    where org_id = '00000000-0000-0000-0000-0000007c0000'),
  6,
  'e não apaga mais nada (6 linhas ficam)'
);

-- ── (7) Grants ─────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.repsol_limpar_valor_na_chave()', 'EXECUTE'),
  'authenticated não executa a limpeza'
);

select * from finish();
rollback;
