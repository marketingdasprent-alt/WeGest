-- ============================================================
-- Versão substituída — public.fn_contratos_renting_versao_imutavel()
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Uma versão substituída é histórico: os valores não se reescrevem. Mas o
-- estado financeiro tem de continuar a mexer-se, senão anular a fatura de um
-- período antigo deixa o contrato preso em 'facturado' sem cobrança nenhuma —
-- e sem botão para refaturar. Ver migração 20260922120000.
-- ============================================================

begin;
select plan(5);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000e0000', 'Org Versão Substituída', 'versub-e');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-0000000e0000', 'Cliente Versão');

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0000', 'VS-11-VS', 'Renault', 'Clio');

-- Versão já substituída e facturada: é este o caso que a UI não conseguia
-- destravar depois de anular a cobrança.
insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, regime, estado_operacional, estado_financeiro,
   data_inicio, data_fim, valor_total_manual, taxa_iva, versao, substituido_em)
values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e0000',
   '00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-0000000e0a01',
   'rent_a_car', 'fechado', 'facturado',
   '2026-08-23T10:00:00Z', '2026-09-22T10:00:00Z', 494.67, 23, 4,
   '2026-08-25T21:26:31Z');

-- ── O que passa a ser permitido ────────────────────────────

select lives_ok(
  $$ update public.contratos_renting
        set estado_financeiro = 'pendente'
      where id = '00000000-0000-0000-0000-0000000e0001' $$,
  'anular a faturação de uma versão substituída deixou de rebentar'
);

select is(
  (select estado_financeiro::text from public.contratos_renting
    where id = '00000000-0000-0000-0000-0000000e0001'),
  'pendente',
  'e o contrato ficou mesmo refaturável'
);

select is(
  (select facturado_em from public.contratos_renting
    where id = '00000000-0000-0000-0000-0000000e0001'),
  null,
  'o freeze_totals limpou o carimbo de faturação'
);

-- Refaturar é o outro sentido da mesma porta.
select lives_ok(
  $$ update public.contratos_renting
        set estado_financeiro = 'facturado'
      where id = '00000000-0000-0000-0000-0000000e0001' $$,
  'e volta a facturado quando se emite documento novo'
);

-- ── O que continua trancado ────────────────────────────────

select throws_like(
  $$ update public.contratos_renting
        set valor_total_manual = 999.99
      where id = '00000000-0000-0000-0000-0000000e0001' $$,
  '%imutável%',
  'os valores da versão antiga continuam a não se reescrever'
);

select * from finish();
rollback;
