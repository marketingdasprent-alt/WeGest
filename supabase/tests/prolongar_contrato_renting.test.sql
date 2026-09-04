-- ============================================================
-- Prolongar contrato de renting — public.prolongar_contrato_renting()
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Prolongar estica a data de fim do MESMO contrato (mesmo código) e, quando o
-- contrato já está faturado, cria a cobrança dos dias extra na mesma transação.
-- Não confundir com renovar, que fecha o período e abre outro.
--
-- O que estas provas defendem, por ordem de importância:
--   * não se cobram os mesmos dias duas vezes (contrato pendente não emite);
--   * não se estica para cima de outro contrato ou reserva da mesma viatura;
--   * a data e a cobrança andam juntas — ou as duas, ou nenhuma.
-- ============================================================

begin;
select plan(10);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0000', 'Org Prolongamento', 'prolong-e');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0000', 'Cliente Prolongamento');

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0000', 'PP-11-PP', 'Renault', 'Clio'),
  ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0000', 'PP-22-PP', 'Renault', 'Clio'),
  ('00000000-0000-0000-0000-0000000f0a03', '00000000-0000-0000-0000-0000000f0000', 'PP-33-PP', 'Renault', 'Clio');

-- C1: rent-a-car FATURADO, com cobrança — o caso que emite documento novo.
insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, regime, estado_operacional, estado_financeiro,
   data_inicio, data_fim, valor_total_manual, taxa_iva)
values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000f0000',
   '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a01',
   'rent_a_car', 'em_curso', 'facturado',
   '2026-09-01T10:00:00Z', '2026-10-01T10:00:00Z', 600.00, 23);

insert into public.contrato_cobrancas
  (org_id, contrato_id, periodo_de, periodo_ate, destinatario_id, destinatario_papel,
   destinatario_nome, valor_sem_iva, taxa_iva, estado, tipo_cobranca)
values
  ('00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-0000000f0001',
   '2026-09-01', '2026-10-01', '00000000-0000-0000-0000-0000000f0c01', 'cliente',
   'Cliente Prolongamento', 600.00, 23, 'emitida', 'slot_mensal');

-- C2: rent-a-car ainda PENDENTE — não pode emitir nada.
insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, regime, estado_operacional, estado_financeiro,
   data_inicio, data_fim, valor_total_manual, taxa_iva)
values
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0000',
   '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a02',
   'rent_a_car', 'em_curso', 'pendente',
   '2026-09-01T10:00:00Z', '2026-10-01T10:00:00Z', 600.00, 23);

-- C3: TVDE — o prolongamento não se aplica.
insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, regime, estado_operacional, estado_financeiro,
   data_inicio, data_fim, valor_total_manual, taxa_iva, is_longa_duracao)
values
  ('00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-0000000f0000',
   '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a03',
   'tvde', 'em_curso', 'pendente',
   '2026-09-01T10:00:00Z', '2026-10-01T10:00:00Z', 350.00, 23, true);

-- ── Guardas ────────────────────────────────────────────────

select throws_like(
  $$ select prolongar_contrato_renting('00000000-0000-0000-0000-0000000f0003', '2026-10-15T10:00:00Z', null) $$,
  '%só para contratos rent-a-car%',
  'TVDE é recusado — ali o período avança pela renovação'
);

select throws_like(
  $$ select prolongar_contrato_renting('00000000-0000-0000-0000-0000000f0001', '2026-09-20T10:00:00Z', null) $$,
  '%tem de ser posterior%',
  'uma data anterior à actual é recusada'
);

select throws_like(
  $$ select prolongar_contrato_renting('00000000-0000-0000-0000-0000000f0002', '2026-10-06T10:00:00Z', 100) $$,
  '%ainda não está faturado%',
  'contrato pendente não emite documento à parte — senão cobrava os dias duas vezes'
);

-- ── Contrato pendente: estica e mais nada ──────────────────

select is(
  prolongar_contrato_renting('00000000-0000-0000-0000-0000000f0002', '2026-10-06T10:00:00Z', null),
  null,
  'sem valor não devolve cobrança nenhuma'
);

select is(
  (select data_fim from public.contratos_renting where id = '00000000-0000-0000-0000-0000000f0002'),
  '2026-10-06T10:00:00Z'::timestamptz,
  'mas a data ficou esticada na mesma'
);

select is(
  (select estado_financeiro::text from public.contratos_renting where id = '00000000-0000-0000-0000-0000000f0002'),
  'pendente',
  'e o estado financeiro não foi tocado'
);

-- ── Contrato faturado: estica E cobra ──────────────────────

select isnt(
  prolongar_contrato_renting('00000000-0000-0000-0000-0000000f0001', '2026-10-06T10:00:00Z', 100.00),
  null,
  'contrato faturado devolve o id da cobrança criada'
);

select is(
  (select count(*)::int from public.contrato_cobrancas
    where contrato_id = '00000000-0000-0000-0000-0000000f0001' and manual = true),
  1,
  'criou uma cobrança manual — manual porque escapa ao índice único de período'
);

select is(
  (select periodo_de::text || '/' || periodo_ate::text from public.contrato_cobrancas
    where contrato_id = '00000000-0000-0000-0000-0000000f0001' and manual = true),
  '2026-10-01/2026-10-06',
  'e cobre só os dias novos, do fim antigo ao novo'
);

-- ── Sobreposição ───────────────────────────────────────────
-- Outro contrato da mesma viatura logo a seguir: não se estica por cima dele.

insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, regime, estado_operacional, estado_financeiro,
   data_inicio, data_fim, valor_total_manual, taxa_iva)
values
  ('00000000-0000-0000-0000-0000000f0004', '00000000-0000-0000-0000-0000000f0000',
   '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a02',
   'rent_a_car', 'agendado', 'pendente',
   '2026-11-01T10:00:00Z', '2026-12-01T10:00:00Z', 600.00, 23);

select throws_like(
  $$ select prolongar_contrato_renting('00000000-0000-0000-0000-0000000f0002', '2026-11-15T10:00:00Z', null) $$,
  '%já tem o contrato%',
  'não se estica por cima de outro contrato da mesma viatura'
);

select * from finish();
rollback;
