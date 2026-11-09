-- ============================================================
-- Saldo pendente não conta duas vezes o que o resumo já somou — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Pedro Souto, semana de 05/10/2026: líquido 985,37 €, saldo 1 038,94 €. O
-- acerto de 53,57 € estava no líquido e ficava também pendente à parte. Ver a
-- migração 20261012170000.
--   (1) movimento lançado antes de o líquido ser gravado: já está nele;
--   (2) devolução de caução: o resumo não a soma, conta à parte;
--   (3) movimento lançado depois de o líquido ser gravado: conta à parte;
--   (4) semana paga: o que entrou antes do pagamento já foi pago no líquido;
--   (5) semana paga: o que entrou depois do pagamento continua por liquidar;
--   (6) o saldo total e o saldo da semana usam a mesma regra;
--   (7) o papel anónimo não chama a função nova.
-- ============================================================

begin;
select plan(7);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000002c0000', 'Org Saldo Resumo', 'saldo-resumo');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000002c0b01', '00000000-0000-0000-0000-0000002c0000', 'Pedro Souto');

-- Semana A (por pagar), 07/09 a 13/09: líquido gravado a 15/09.
insert into public.motorista_liquido_semanal (id, org_id, motorista_id, semana_inicio, semana_fim, liquido, gravado_em) values
  ('00000000-0000-0000-0000-0000002c0a01', '00000000-0000-0000-0000-0000002c0000',
   '00000000-0000-0000-0000-0000002c0b01', '2026-09-07', '2026-09-13', 985.37, '2026-09-15 10:00+00');

-- Semana B, 31/08 a 06/09: líquido gravado a 08/09, pago a 09/09, reaberta a 12/09.
insert into public.motorista_liquido_semanal (id, org_id, motorista_id, semana_inicio, semana_fim, liquido, gravado_em) values
  ('00000000-0000-0000-0000-0000002c0a02', '00000000-0000-0000-0000-0000002c0000',
   '00000000-0000-0000-0000-0000002c0b01', '2026-08-31', '2026-09-06', 500, '2026-09-08 10:00+00');
update public.motorista_financeiro set status = 'pago', data_pagamento = '2026-09-09'
 where liquido_semanal_id = '00000000-0000-0000-0000-0000002c0a02';
update public.motorista_liquido_semanal set gravado_em = '2026-09-12 10:00+00'
 where id = '00000000-0000-0000-0000-0000002c0a02';

insert into public.motorista_financeiro
  (id, org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status, created_at) values
  -- semana A
  ('00000000-0000-0000-0000-0000002c0f01', '00000000-0000-0000-0000-0000002c0000', '00000000-0000-0000-0000-0000002c0b01',
   'credito', 'renda_viatura', 'Acerto', 53.57, '2026-09-09', 'pendente', '2026-09-14 10:00+00'),
  ('00000000-0000-0000-0000-0000002c0f02', '00000000-0000-0000-0000-0000002c0000', '00000000-0000-0000-0000-0000002c0b01',
   'credito', 'caucao', 'Devolução de caução', 100, '2026-09-10', 'pendente', '2026-09-14 10:00+00'),
  ('00000000-0000-0000-0000-0000002c0f03', '00000000-0000-0000-0000-0000002c0000', '00000000-0000-0000-0000-0000002c0b01',
   'debito', 'outro', 'Lançado depois', 20, '2026-09-11', 'pendente', '2026-09-16 10:00+00'),
  -- semana B
  ('00000000-0000-0000-0000-0000002c0f04', '00000000-0000-0000-0000-0000002c0000', '00000000-0000-0000-0000-0000002c0b01',
   'debito', 'seguros', 'Seguro', 30, '2026-09-02', 'pendente', '2026-09-07 10:00+00'),
  ('00000000-0000-0000-0000-0000002c0f05', '00000000-0000-0000-0000-0000002c0000', '00000000-0000-0000-0000-0000002c0b01',
   'debito', 'outro', 'Depois de pago', 40, '2026-09-03', 'pendente', '2026-09-10 10:00+00');

select set_eq(
  $$ select movimento_id from public.movimentos_ja_no_resumo(array['00000000-0000-0000-0000-0000002c0b01'::uuid]) $$,
  $$ values ('00000000-0000-0000-0000-0000002c0f01'::uuid), ('00000000-0000-0000-0000-0000002c0f04'::uuid) $$,
  'já no resumo: o acerto da semana por pagar e o seguro anterior ao pagamento (1, 4)'
);

select ok(
  not exists (select 1 from public.movimentos_ja_no_resumo(array['00000000-0000-0000-0000-0000002c0b01'::uuid])
               where movimento_id = '00000000-0000-0000-0000-0000002c0f02'),
  'devolução de caução fica à parte (2)'
);

select ok(
  not exists (select 1 from public.movimentos_ja_no_resumo(array['00000000-0000-0000-0000-0000002c0b01'::uuid])
               where movimento_id in ('00000000-0000-0000-0000-0000002c0f03', '00000000-0000-0000-0000-0000002c0f05')),
  'lançado depois do líquido ou do pagamento fica à parte (3, 5)'
);

select is(
  (select saldo from public.motoristas_saldo_pendente_lote(
     array['00000000-0000-0000-0000-0000002c0b01'::uuid], '2026-09-07', '2026-09-13')),
  1065.37::numeric,
  'saldo da semana A = líquido 985,37 + caução 100 − débito posterior 20, sem o acerto outra vez'
);

select is(
  (select saldo from public.motoristas_saldo_pendente_lote(
     array['00000000-0000-0000-0000-0000002c0b01'::uuid], '2026-08-31', '2026-09-06')),
  -40.00::numeric,
  'semana B paga: só fica o débito lançado depois do pagamento'
);

select is(
  public.motorista_saldo_pendente('00000000-0000-0000-0000-0000002c0b01'),
  1025.37::numeric,
  'saldo total com a mesma regra (6)'
);

select ok(
  not has_function_privilege('anon', 'public.movimentos_ja_no_resumo(uuid[])', 'execute'),
  'anon não chama movimentos_ja_no_resumo (7)'
);

select * from finish();
rollback;
