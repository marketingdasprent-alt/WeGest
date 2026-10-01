-- ============================================================
-- Uma parcela por semana em cada plano "(n/N)" — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Reproduz o caso do Ekene (2026-09-17): parcelas do mesmo acordo inseridas
-- uma a uma, todas com a mesma data. Ver a migração 20261001130000.
--   (1) o lote do ecrã (uma parcela por semana) entra;
--   (2) segunda parcela do mesmo plano na mesma semana é recusada,
--       mesmo noutro dia dessa semana;
--   (3) parcela cancelada não ocupa a semana;
--   (4) outro plano, outro N, outro motorista ou lançamento sem "(n/N)"
--       na mesma semana entram;
--   (5) mudar a data de uma parcela para a semana de outra é recusado.
-- ============================================================

begin;
select plan(9);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000001a0000', 'Org Parcelas', 'pp-a');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000001a0b01', '00000000-0000-0000-0000-0000001a0000', 'Motorista Parcelas'),
  ('00000000-0000-0000-0000-0000001a0b02', '00000000-0000-0000-0000-0000001a0000', 'Outro Motorista');

-- (1) Como o ecrã grava: um só INSERT, uma parcela por semana.
select lives_ok(
  $$insert into public.motorista_financeiro (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
      ('00000000-0000-0000-0000-0000001a0000', '00000000-0000-0000-0000-0000001a0b01', 'debito', 'acordo', 'Acordo de pagamento: Para brisas (1/3)', 10, '2026-09-21', 'pendente'),
      ('00000000-0000-0000-0000-0000001a0000', '00000000-0000-0000-0000-0000001a0b01', 'debito', 'acordo', 'Acordo de pagamento: Para brisas (2/3)', 10, '2026-09-28', 'pendente'),
      ('00000000-0000-0000-0000-0000001a0000', '00000000-0000-0000-0000-0000001a0b01', 'debito', 'acordo', 'Acordo de pagamento: Para brisas (3/3)', 10, '2026-10-05', 'pendente')$$,
  'lote com uma parcela por semana entra'
);

-- (2) O caso do Ekene: outra parcela do mesmo plano na semana de 21/09 (quarta-feira).
select throws_ok(
  $$insert into public.motorista_financeiro (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
      ('00000000-0000-0000-0000-0000001a0000', '00000000-0000-0000-0000-0000001a0b01', 'debito', 'acordo', 'Acordo de pagamento: Para brisas (2/3)', 10, '2026-09-23', 'pendente')$$,
  '23505',
  null,
  'segunda parcela do mesmo plano na mesma semana é recusada'
);

-- (3) Cancelada não ocupa a semana.
update public.motorista_financeiro set status = 'cancelado'
 where descricao = 'Acordo de pagamento: Para brisas (3/3)';
select lives_ok(
  $$insert into public.motorista_financeiro (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
      ('00000000-0000-0000-0000-0000001a0000', '00000000-0000-0000-0000-0000001a0b01', 'debito', 'acordo', 'Acordo de pagamento: Para brisas (3/3)', 10, '2026-10-05', 'pendente')$$,
  'parcela cancelada liberta a semana'
);

-- (4) O que não é o mesmo plano entra na mesma semana.
select lives_ok(
  $$insert into public.motorista_financeiro (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
      ('00000000-0000-0000-0000-0000001a0000', '00000000-0000-0000-0000-0000001a0b01', 'debito', 'acordo', 'Acordo de pagamento: Pneus (1/2)', 10, '2026-09-21', 'pendente')$$,
  'outro plano na mesma semana entra'
);
select lives_ok(
  $$insert into public.motorista_financeiro (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
      ('00000000-0000-0000-0000-0000001a0000', '00000000-0000-0000-0000-0000001a0b01', 'debito', 'acordo', 'Acordo de pagamento: Para brisas (1/6)', 10, '2026-09-21', 'pendente')$$,
  'mesma descrição com outro N é outro plano'
);
select lives_ok(
  $$insert into public.motorista_financeiro (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
      ('00000000-0000-0000-0000-0000001a0000', '00000000-0000-0000-0000-0000001a0b02', 'debito', 'acordo', 'Acordo de pagamento: Para brisas (1/3)', 10, '2026-09-21', 'pendente')$$,
  'outro motorista com o mesmo plano entra'
);
select lives_ok(
  $$insert into public.motorista_financeiro (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
      ('00000000-0000-0000-0000-0000001a0000', '00000000-0000-0000-0000-0000001a0b01', 'debito', 'outro', 'Portagens', 10, '2026-09-21', 'pendente'),
      ('00000000-0000-0000-0000-0000001a0000', '00000000-0000-0000-0000-0000001a0b01', 'debito', 'outro', 'Portagens', 10, '2026-09-22', 'pendente')$$,
  'lançamentos sem "(n/N)" não são afectados'
);

-- (5) Recuar a data de uma parcela para a semana de outra.
select throws_ok(
  $$update public.motorista_financeiro set data_movimento = '2026-09-22'
     where descricao = 'Acordo de pagamento: Para brisas (2/3)'
       and motorista_id = '00000000-0000-0000-0000-0000001a0b01'$$,
  '23505',
  null,
  'mudar a data para a semana de outra parcela é recusado'
);

select is(
  (select count(*)::int from public.motorista_financeiro
    where motorista_id = '00000000-0000-0000-0000-0000001a0b01'
      and descricao like 'Acordo de pagamento: Para brisas (%/3)'
      and status <> 'cancelado'),
  3,
  'o plano fica com 3 parcelas activas'
);

select * from finish();
rollback;
