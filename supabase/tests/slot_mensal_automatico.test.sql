-- ============================================================
-- Mensalidade de slot automática por organização (pgTAP)
-- ============================================================
-- gerar_slot_mensal_motoristas(): só nas orgs com slot_mensal_automatico,
-- na N-ésima segunda-feira do mês escolhida no motorista
-- (slot_semana_cobranca), sem duplicar recorrência ativa, lançamento
-- manual da semana nem a própria corrida anterior.
-- Novembro 2026: segundas 02, 09, 16, 23 e 30.
-- ============================================================

begin;
select plan(11);

insert into public.organizacoes (id, nome, codigo, slot_mensal_automatico) values
  ('00000000-0000-0000-0000-0000005a0001', 'Org Slot Auto', 'slot-auto-on', true),
  ('00000000-0000-0000-0000-0000005a0002', 'Org Slot Reservas', 'slot-auto-off', false);

insert into public.motoristas_ativos (id, org_id, nome, status_ativo, is_slot, slot_valor_semanal, slot_semana_cobranca) values
  -- org ligada, 1ª semana: cobrado
  ('00000000-0000-0000-0000-0000005ac001', '00000000-0000-0000-0000-0000005a0001', 'Slot 1a Semana', true, true, 125, 1),
  -- org ligada: já tem recorrência de slot ativa
  ('00000000-0000-0000-0000-0000005ac002', '00000000-0000-0000-0000-0000005a0001', 'Slot Com Recorrencia', true, true, 125, 1),
  -- org ligada: já lançado à mão nessa semana
  ('00000000-0000-0000-0000-0000005ac003', '00000000-0000-0000-0000-0000005a0001', 'Slot Manual', true, true, 125, 1),
  -- org ligada: inativo
  ('00000000-0000-0000-0000-0000005ac004', '00000000-0000-0000-0000-0000005a0001', 'Slot Inativo', false, true, 125, 1),
  -- org ligada: não é slot
  ('00000000-0000-0000-0000-0000005ac005', '00000000-0000-0000-0000-0000005a0001', 'Nao Slot', true, false, 125, 1),
  -- org desligada (cobra pelas reservas)
  ('00000000-0000-0000-0000-0000005ac006', '00000000-0000-0000-0000-0000005a0002', 'Slot Outra Org', true, true, 125, 1),
  -- org ligada, 2ª semana
  ('00000000-0000-0000-0000-0000005ac007', '00000000-0000-0000-0000-0000005a0001', 'Slot 2a Semana', true, true, 200, 2);

insert into public.motorista_financeiro_recorrencias
  (org_id, motorista_id, tipo, categoria, descricao, valor, frequencia, semana_ancora, status) values
  ('00000000-0000-0000-0000-0000005a0001', '00000000-0000-0000-0000-0000005ac002', 'debito', 'slot_mensal', 'slot', 125, 'mensal', '2026-07-27', 'ativa');

insert into public.motorista_financeiro
  (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
  ('00000000-0000-0000-0000-0000005a0001', '00000000-0000-0000-0000-0000005ac003', 'debito', 'slot_mensal', 'manual', 125, '2026-11-03', 'pendente');

-- 04/11/2026 cai na semana da 1ª segunda-feira (02/11).
select is(public.gerar_slot_mensal_motoristas('2026-11-04'), 1, '1ª semana lança só o motorista elegível da 1ª');

select results_eq(
  $$ select valor, data_movimento, categoria, tipo, status, descricao, referencia
       from public.motorista_financeiro
      where motorista_id = '00000000-0000-0000-0000-0000005ac001' $$,
  $$ values (125.00::numeric, '2026-11-02'::date, 'slot_mensal'::text, 'debito'::text, 'pendente'::text,
             'Mensalidade slot — 11/2026'::text,
             'slot-auto:00000000-0000-0000-0000-0000005ac001:2026-11'::text) $$,
  'débito slot_mensal de novembro na 1ª segunda-feira, com o Valor Mensal'
);

select is(
  (select count(*)::int from public.motorista_financeiro where motorista_id = '00000000-0000-0000-0000-0000005ac007'),
  0, 'motorista da 2ª semana não é lançado na 1ª'
);

select is(
  (select count(*)::int from public.motorista_financeiro where motorista_id = '00000000-0000-0000-0000-0000005ac002'),
  0, 'motorista com recorrência de slot ativa não é cobrado duas vezes'
);

select is(
  (select count(*)::int from public.motorista_financeiro where motorista_id = '00000000-0000-0000-0000-0000005ac003'),
  1, 'lançamento manual da semana não é duplicado'
);

select is(
  (select count(*)::int from public.motorista_financeiro
    where motorista_id in ('00000000-0000-0000-0000-0000005ac004', '00000000-0000-0000-0000-0000005ac005')),
  0, 'motorista inativo ou sem slot não é cobrado'
);

select is(
  (select count(*)::int from public.motorista_financeiro where motorista_id = '00000000-0000-0000-0000-0000005ac006'),
  0, 'org com slot_mensal_automatico desligado não é tocada'
);

select is(public.gerar_slot_mensal_motoristas('2026-11-02'), 0, 'segunda corrida na mesma semana não duplica');

select is(public.gerar_slot_mensal_motoristas('2026-11-09'), 1, '2ª semana lança o motorista da 2ª');

select is(public.gerar_slot_mensal_motoristas('2026-11-30'), 0, '5ª segunda-feira não lança ninguém');

select ok(
  not has_function_privilege('authenticated', 'public.gerar_slot_mensal_motoristas(date)', 'execute'),
  'authenticated não executa a função'
);

select * from finish();
rollback;
