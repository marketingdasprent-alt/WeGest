-- ============================================================
-- Slot só tem contrato de prestação: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Reproduz o André (#455, 02/10/2026): reserva Slot a 125 €/mês com um contrato
-- TVDE preso, que a 275 €/semana cobrava o preço do modelo. Ver a migração
-- 20261002130000. Provas:
--   (1) contrato de renting não nasce numa reserva Slot, nem se muda uma lá para dentro;
--   (2) reserva não passa a Slot com contrato vivo, mas passa sem ele;
--   (3) a geração de cobranças TVDE ignora reservas Slot;
--   (4) a migração cria a prestação, retira só o contrato TVDE vivo da reserva Slot em
--       curso com motorista, mantém a reserva em curso e o vínculo motorista-viatura aberto;
--   (5) não toca em reservas não Slot nem em Slot sem motorista, e repete-se sem efeito;
--   (6) só o dono da base chama a função.
-- ============================================================

begin;
select plan(20);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000005c00ff', 'bootstrap@slot-prestacao.pt'),
  ('00000000-0000-0000-0000-0000005c0a01', 'gestor@slot-prestacao.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000005c0000', 'Org Slot Prestacao', 'slot-prestacao');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000005c0aa1', '00000000-0000-0000-0000-0000005c0000', 'Renault');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000005c0ab1', '00000000-0000-0000-0000-0000005c0000',
   '00000000-0000-0000-0000-0000005c0aa1', 'Clio');
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id)
select ('00000000-0000-0000-0000-0000005c0e0' || n)::uuid, '00000000-0000-0000-0000-0000005c0000',
       'SP-0' || n || '-AA', '00000000-0000-0000-0000-0000005c0aa1', '00000000-0000-0000-0000-0000005c0ab1'
  from generate_series(1, 4) as n;

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000005c0c01', '00000000-0000-0000-0000-0000005c0000', 'Cliente Slot');

insert into public.motoristas_ativos (id, org_id, nome, status_ativo) values
  ('00000000-0000-0000-0000-0000005c0d01', '00000000-0000-0000-0000-0000005c0000', 'Andre Slot', true),
  ('00000000-0000-0000-0000-0000005c0d02', '00000000-0000-0000-0000-0000005c0000', 'Rent A Car', true);

-- trg_slot_cobranca_entrada gera cobranças ao inserir: desligado só durante os INSERTs.
alter table public.reservas disable trigger trg_slot_cobranca_entrada;

insert into public.reservas
  (id, org_id, codigo, regime, estado, data_inicio, viatura_id, condutor_id, cliente_id, slot_valor_mensal, created_by)
values
  -- Slot em curso com motorista e contrato TVDE vivo (o André).
  ('00000000-0000-0000-0000-0000005c0f01', '00000000-0000-0000-0000-0000005c0000', 991001,
   'slot', 'em_curso', timestamptz '2026-06-01 10:00+00', '00000000-0000-0000-0000-0000005c0e01',
   '00000000-0000-0000-0000-0000005c0d01', '00000000-0000-0000-0000-0000005c0c01', 125,
   '00000000-0000-0000-0000-0000005c0a01'),
  -- Slot em curso sem motorista: fica de fora.
  ('00000000-0000-0000-0000-0000005c0f02', '00000000-0000-0000-0000-0000005c0000', 991002,
   'slot', 'em_curso', timestamptz '2026-06-01 10:00+00', '00000000-0000-0000-0000-0000005c0e02',
   null, '00000000-0000-0000-0000-0000005c0c01', 125, '00000000-0000-0000-0000-0000005c0a01'),
  -- Reserva TVDE normal com contrato vivo: não é tocada.
  ('00000000-0000-0000-0000-0000005c0f03', '00000000-0000-0000-0000-0000005c0000', 991003,
   'tvde', 'em_curso', timestamptz '2026-06-01 10:00+00', '00000000-0000-0000-0000-0000005c0e03',
   '00000000-0000-0000-0000-0000005c0d02', '00000000-0000-0000-0000-0000005c0c01', null,
   '00000000-0000-0000-0000-0000005c0a01'),
  -- Reserva normal, sem contrato: pode passar a Slot.
  ('00000000-0000-0000-0000-0000005c0f04', '00000000-0000-0000-0000-0000005c0000', 991004,
   'tvde', 'em_curso', timestamptz '2026-06-01 10:00+00', '00000000-0000-0000-0000-0000005c0e04',
   null, '00000000-0000-0000-0000-0000005c0c01', null, '00000000-0000-0000-0000-0000005c0a01');

alter table public.reservas enable trigger trg_slot_cobranca_entrada;

-- Contrato TVDE da reserva normal (#991003): nasce antes de qualquer Slot.
insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio,
   estado_operacional, estado_financeiro, regime, taxa_iva, created_by)
values
  ('00000000-0000-0000-0000-0000005c0b03', '00000000-0000-0000-0000-0000005c0000', 991003,
   '00000000-0000-0000-0000-0000005c0f03', '00000000-0000-0000-0000-0000005c0c01',
   '00000000-0000-0000-0000-0000005c0e03', 'SP-03-AA', timestamptz '2026-06-01 10:00+00',
   'em_curso', 'pendente', 'tvde', 23, '00000000-0000-0000-0000-0000005c0a01');

-- ── (1) Contrato de renting não nasce numa reserva Slot ─────────

select throws_ok(
  $$ insert into public.contratos_renting
       (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio,
        estado_operacional, estado_financeiro, regime, taxa_iva, created_by)
     values
       ('00000000-0000-0000-0000-0000005c0b09', '00000000-0000-0000-0000-0000005c0000', 991009,
        '00000000-0000-0000-0000-0000005c0f01', '00000000-0000-0000-0000-0000005c0c01',
        '00000000-0000-0000-0000-0000005c0e01', 'SP-01-AA', timestamptz '2026-06-01 10:00+00',
        'em_curso', 'pendente', 'tvde', 23, '00000000-0000-0000-0000-0000005c0a01') $$,
  '23514',
  null,
  'contrato TVDE numa reserva Slot é recusado'
);

select throws_ok(
  $$ update public.contratos_renting
        set reserva_id = '00000000-0000-0000-0000-0000005c0f01'
      where id = '00000000-0000-0000-0000-0000005c0b03' $$,
  '23514',
  null,
  'mudar um contrato para uma reserva Slot é recusado'
);

-- ── (2) Reserva só passa a Slot sem contrato vivo ───────────────

select throws_ok(
  $$ update public.reservas set regime = 'slot' where id = '00000000-0000-0000-0000-0000005c0f03' $$,
  '23514',
  null,
  'reserva com contrato vivo não passa a Slot'
);

select lives_ok(
  $$ update public.reservas set regime = 'slot' where id = '00000000-0000-0000-0000-0000005c0f04' $$,
  'reserva sem contrato passa a Slot'
);

-- ── (3) Fixture do André: contrato TVDE legado, criado com a guarda desligada ──

alter table public.contratos_renting disable trigger trg_rejeitar_contrato_slot;
insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio,
   estado_operacional, estado_financeiro, regime, taxa_iva, created_by)
values
  ('00000000-0000-0000-0000-0000005c0b01', '00000000-0000-0000-0000-0000005c0000', 991001,
   '00000000-0000-0000-0000-0000005c0f01', '00000000-0000-0000-0000-0000005c0c01',
   '00000000-0000-0000-0000-0000005c0e01', 'SP-01-AA', timestamptz '2026-06-01 10:00+00',
   'agendado', 'pendente', 'tvde', 23, '00000000-0000-0000-0000-0000005c0a01');
alter table public.contratos_renting enable trigger trg_rejeitar_contrato_slot;

insert into public.motorista_viaturas (id, org_id, motorista_id, viatura_id, status, data_inicio)
values
  ('00000000-0000-0000-0000-0000005c0e91', '00000000-0000-0000-0000-0000005c0000',
   '00000000-0000-0000-0000-0000005c0d01', '00000000-0000-0000-0000-0000005c0e01', 'ativo', date '2026-06-01');

select is(
  (select count(*)::int from public.contratos_prestacao
    where reserva_id = '00000000-0000-0000-0000-0000005c0f01'),
  0,
  'antes da migração, a reserva do André não tem contrato de prestação'
);

-- ── (4) A migração ─────────────────────────────────────────────

select is(
  public.migrar_reservas_slot_para_prestacao(),
  1,
  'retira 1 contrato: o TVDE vivo da reserva Slot em curso com motorista'
);

select is(
  (select count(*)::int from public.contratos_prestacao
    where reserva_id = '00000000-0000-0000-0000-0000005c0f01' and estado = 'ativo' and deleted_at is null),
  1,
  'a reserva do André ganhou um contrato de prestação ativo'
);

select is(
  (select valor_semanal from public.contratos_prestacao
    where reserva_id = '00000000-0000-0000-0000-0000005c0f01'),
  125.00::numeric,
  'com os 125 € mensais da reserva'
);

select is(
  (select motorista_nome from public.contratos_prestacao
    where reserva_id = '00000000-0000-0000-0000-0000005c0f01'),
  'Andre Slot',
  'e os dados do motorista'
);

select isnt(
  (select deleted_at from public.contratos_renting where id = '00000000-0000-0000-0000-0000005c0b01'),
  null,
  'o contrato TVDE do André saiu de cena (soft delete)'
);

select is(
  (select estado_operacional::text from public.contratos_renting where id = '00000000-0000-0000-0000-0000005c0b01'),
  'agendado',
  'sem ser cancelado'
);

select is(
  (select estado::text from public.reservas where id = '00000000-0000-0000-0000-0000005c0f01'),
  'em_curso',
  'a reserva Slot continua em curso (a mensalidade não pára)'
);

select is(
  (select status from public.motorista_viaturas where id = '00000000-0000-0000-0000-0000005c0e91'),
  'ativo',
  'o vínculo motorista-viatura continua aberto'
);

-- ── (5) Fora do alvo e repetição ───────────────────────────────

select is(
  (select deleted_at from public.contratos_renting where id = '00000000-0000-0000-0000-0000005c0b03'),
  null,
  'o contrato TVDE da reserva normal não foi tocado'
);

select is(
  (select count(*)::int from public.contratos_prestacao
    where reserva_id = '00000000-0000-0000-0000-0000005c0f02'),
  0,
  'Slot sem motorista não ganha prestação'
);

select is(
  public.migrar_reservas_slot_para_prestacao(),
  0,
  'segunda passagem: nada a retirar'
);

select is(
  (select count(*)::int from public.contratos_prestacao
    where reserva_id = '00000000-0000-0000-0000-0000005c0f01'),
  1,
  'e a prestação não duplica'
);

-- ── (3b) Cobranças TVDE ignoram reservas Slot ──────────────────
-- Volta a pôr o contrato legado vivo para provar que, mesmo vivo, não gera cobrança.

alter table public.contratos_renting disable trigger trg_contrato_renting_liga_motorista_close;
update public.contratos_renting set deleted_at = null where id = '00000000-0000-0000-0000-0000005c0b01';
alter table public.contratos_renting enable trigger trg_contrato_renting_liga_motorista_close;

select lives_ok(
  $$ select public.gerar_cobrancas_tvde_semanais(4) $$,
  'a geração de cobranças TVDE corre'
);

select is(
  (select count(*)::int from public.contrato_cobrancas
    where contrato_id = '00000000-0000-0000-0000-0000005c0b01'),
  0,
  'contrato TVDE preso a reserva Slot não gera cobrança semanal'
);

-- ── (6) Grants ─────────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.migrar_reservas_slot_para_prestacao()', 'EXECUTE'),
  'authenticated não executa a migração'
);

select * from finish();
rollback;
