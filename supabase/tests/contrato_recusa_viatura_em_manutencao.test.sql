-- ============================================================
-- Viatura em manutenção não se entrega: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Ver a migração 20261015150000. Provas:
--   (1) contrato novo numa viatura em manutenção é recusado; numa disponível passa;
--   (2) mudar um contrato para uma viatura em manutenção é recusado;
--   (3) renovar (versão nova) com a MESMA viatura passa, mesmo em manutenção;
--       versão nova com OUTRA viatura em manutenção (troca) é recusada;
--   (4) fechar um contrato cuja viatura entretanto foi para manutenção passa;
--       reabri-lo não;
--   (5) só o dono da base chama a função.
-- ============================================================

begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000c7000ff', 'bootstrap@contrato-manut.pt'),
  ('00000000-0000-0000-0000-00000c700a01', 'gestor@contrato-manut.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000c700000', 'Org Contrato Manutencao', 'contrato-manut-a');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000c700aa1', '00000000-0000-0000-0000-00000c700000', 'Dacia');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-00000c700ab1', '00000000-0000-0000-0000-00000c700000',
   '00000000-0000-0000-0000-00000c700aa1', 'Jogger');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, status) values
  ('00000000-0000-0000-0000-00000c700e01', '00000000-0000-0000-0000-00000c700000', 'CM-01-AA',
   '00000000-0000-0000-0000-00000c700aa1', '00000000-0000-0000-0000-00000c700ab1', 'manutencao'),
  ('00000000-0000-0000-0000-00000c700e02', '00000000-0000-0000-0000-00000c700000', 'CM-02-AA',
   '00000000-0000-0000-0000-00000c700aa1', '00000000-0000-0000-0000-00000c700ab1', 'disponivel'),
  ('00000000-0000-0000-0000-00000c700e03', '00000000-0000-0000-0000-00000c700000', 'CM-03-AA',
   '00000000-0000-0000-0000-00000c700aa1', '00000000-0000-0000-0000-00000c700ab1', 'disponivel');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000c700c01', '00000000-0000-0000-0000-00000c700000', 'Cliente Manut');

-- ── (1) Contrato novo ──────────────────────────────────────

select throws_ok(
  $$ insert into public.contratos_renting
       (id, org_id, codigo, cliente_id, viatura_id, matricula, data_inicio,
        estado_operacional, estado_financeiro, regime, taxa_iva, created_by)
     values
       ('00000000-0000-0000-0000-00000c700b01', '00000000-0000-0000-0000-00000c700000', 992001,
        '00000000-0000-0000-0000-00000c700c01', '00000000-0000-0000-0000-00000c700e01', 'CM-01-AA',
        timestamptz '2026-10-14 10:00+00', 'em_curso', 'pendente', 'tvde', 23,
        '00000000-0000-0000-0000-00000c700a01') $$,
  '23514',
  null,
  'contrato novo numa viatura em manutenção é recusado'
);

select lives_ok(
  $$ insert into public.contratos_renting
       (id, org_id, codigo, cliente_id, viatura_id, matricula, data_inicio,
        estado_operacional, estado_financeiro, regime, taxa_iva, created_by)
     values
       ('00000000-0000-0000-0000-00000c700b02', '00000000-0000-0000-0000-00000c700000', 992002,
        '00000000-0000-0000-0000-00000c700c01', '00000000-0000-0000-0000-00000c700e02', 'CM-02-AA',
        timestamptz '2026-10-14 10:00+00', 'em_curso', 'pendente', 'tvde', 23,
        '00000000-0000-0000-0000-00000c700a01') $$,
  'contrato novo numa viatura disponível passa'
);

-- ── (2) Mudar de viatura ───────────────────────────────────

select throws_ok(
  $$ update public.contratos_renting
        set viatura_id = '00000000-0000-0000-0000-00000c700e01', matricula = 'CM-01-AA'
      where id = '00000000-0000-0000-0000-00000c700b02' $$,
  '23514',
  null,
  'mudar o contrato para uma viatura em manutenção é recusado'
);

-- ── (3) Versões ────────────────────────────────────────────
-- A viatura do contrato vivo vai para manutenção (ticket menor, carro na rua).
update public.viaturas set status = 'manutencao' where id = '00000000-0000-0000-0000-00000c700e02';

-- Como criar_versao_contrato_renting: a versão anterior fica substituída antes de nascer a nova
-- (senão contratos_no_overbooking recusa a sobreposição, e não é isso que se quer provar).
update public.contratos_renting
   set substituido_em = now(), estado_operacional = 'fechado', data_fim = timestamptz '2026-10-21 10:00+00'
 where id = '00000000-0000-0000-0000-00000c700b02';

select lives_ok(
  $$ insert into public.contratos_renting
       (id, org_id, codigo, cliente_id, viatura_id, matricula, data_inicio,
        estado_operacional, estado_financeiro, regime, taxa_iva, created_by,
        versao, contrato_anterior_id, motivo_versao)
     values
       ('00000000-0000-0000-0000-00000c700b03', '00000000-0000-0000-0000-00000c700000', 992002,
        '00000000-0000-0000-0000-00000c700c01', '00000000-0000-0000-0000-00000c700e02', 'CM-02-AA',
        timestamptz '2026-10-21 10:00+00', 'em_curso', 'pendente', 'tvde', 23,
        '00000000-0000-0000-0000-00000c700a01',
        2, '00000000-0000-0000-0000-00000c700b02', 'Renovacao de teste') $$,
  'renovar com a mesma viatura passa, mesmo em manutenção'
);

select throws_ok(
  $$ insert into public.contratos_renting
       (id, org_id, codigo, cliente_id, viatura_id, matricula, data_inicio,
        estado_operacional, estado_financeiro, regime, taxa_iva, created_by,
        versao, contrato_anterior_id, motivo_versao)
     values
       ('00000000-0000-0000-0000-00000c700b04', '00000000-0000-0000-0000-00000c700000', 992002,
        '00000000-0000-0000-0000-00000c700c01', '00000000-0000-0000-0000-00000c700e01', 'CM-01-AA',
        timestamptz '2026-10-21 10:00+00', 'em_curso', 'pendente', 'tvde', 23,
        '00000000-0000-0000-0000-00000c700a01',
        3, '00000000-0000-0000-0000-00000c700b03', 'Troca de teste') $$,
  '23514',
  null,
  'versão nova com OUTRA viatura em manutenção (troca) é recusada'
);

-- ── (4) Fechar passa; reabrir não ──────────────────────────

select lives_ok(
  $$ update public.contratos_renting set estado_operacional = 'fechado', tipo_fecho = 'recolhido'
      where id = '00000000-0000-0000-0000-00000c700b03' $$,
  'fechar um contrato com a viatura em manutenção passa'
);

-- O fecho pode recalcular a disponibilidade da viatura; o que se prova é a reabertura.
update public.viaturas set status = 'manutencao' where id = '00000000-0000-0000-0000-00000c700e02';

select throws_ok(
  $$ update public.contratos_renting set estado_operacional = 'em_curso'
      where id = '00000000-0000-0000-0000-00000c700b03' $$,
  '23514',
  null,
  'reabrir com a viatura ainda em manutenção é recusado'
);

update public.viaturas set status = 'disponivel' where id = '00000000-0000-0000-0000-00000c700e02';

select lives_ok(
  $$ update public.contratos_renting set estado_operacional = 'em_curso'
      where id = '00000000-0000-0000-0000-00000c700b03' $$,
  'com a viatura outra vez fora de manutenção, reabrir passa'
);

-- ── (5) Grants ─────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.fn_contrato_recusa_viatura_em_manutencao()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fn_contrato_recusa_viatura_em_manutencao()', 'EXECUTE'),
  'só o dono da base chama a função'
);

select * from finish();
rollback;
