-- ============================================================
-- Extrato do portal: motorista com Retenção leva o corte dos 6% (pgTAP)
-- ============================================================
-- Retenção (2026-10-23): fatura-recibo com IVA e IRS retido (taxas da ficha,
-- por omissão 23% e 23%). Mesmo
-- marcado como verde, os ganhos levam os 6%, como na lista e no resumo.
-- Ver a migração 20261023120000.
-- ============================================================

begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000004e0000', 'Org Retencao', 'retencao-teste');

insert into public.plataformas_configuracao (id, org_id, nome, plataforma, auth_mode) values
  ('00000000-0000-0000-0000-0000004e0e01', '00000000-0000-0000-0000-0000004e0000', 'Bolt', 'bolt', 'oauth');

insert into public.motoristas_ativos (id, org_id, nome, bolt_id, recibo_verde, retencao_irs, status_ativo) values
  ('00000000-0000-0000-0000-0000004e0a01', '00000000-0000-0000-0000-0000004e0000', 'Com Retencao', 'drv-ret', true, true, true),
  ('00000000-0000-0000-0000-0000004e0a02', '00000000-0000-0000-0000-0000004e0000', 'Verde Simples', 'drv-verde', true, false, true);

insert into public.motoristas_ativos (id, org_id, nome, bolt_id, recibo_verde, retencao_irs, retencao_iva_pct, retencao_irs_pct, status_ativo) values
  ('00000000-0000-0000-0000-0000004e0a03', '00000000-0000-0000-0000-0000004e0000', 'Retencao 23 20', 'drv-ret-20', true, true, 23, 20, true);

select is(
  (select retencao_irs from public.motoristas_ativos where id = '00000000-0000-0000-0000-0000004e0a02'),
  false,
  'retencao_irs nasce desligada'
);

insert into public.bolt_resumos_semanais
  (integracao_id, org_id, periodo, periodo_inicio, periodo_fim, chave_motorista, identificador_motorista,
   ganhos_liquidos, viagens_terminadas, fonte_viagens)
values
  ('00000000-0000-0000-0000-0000004e0e01', '00000000-0000-0000-0000-0000004e0000', '2026-10-12 a 2026-10-18',
   '2026-10-12', '2026-10-18', 'drv-ret', 'drv-ret', 106, 5, 'csv'),
  ('00000000-0000-0000-0000-0000004e0e01', '00000000-0000-0000-0000-0000004e0000', '2026-10-12 a 2026-10-18',
   '2026-10-12', '2026-10-18', 'drv-verde', 'drv-verde', 106, 5, 'csv'),
  ('00000000-0000-0000-0000-0000004e0e01', '00000000-0000-0000-0000-0000004e0000', '2026-10-12 a 2026-10-18',
   '2026-10-12', '2026-10-18', 'drv-ret-20', 'drv-ret-20', 212, 5, 'csv');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select receita from public.motorista_extrato_periodo('00000000-0000-0000-0000-0000004e0a01', '2026-10-12', '2026-10-18')),
  100.00::numeric,
  'com Retenção a receita leva o corte dos 6%, mesmo sendo verde'
);

select is(
  (select receita from public.motorista_extrato_periodo('00000000-0000-0000-0000-0000004e0a02', '2026-10-12', '2026-10-18')),
  106.00::numeric,
  'verde sem Retenção recebe o valor integral'
);

select is(
  (select liquido from public.motorista_extrato_periodo('00000000-0000-0000-0000-0000004e0a01', '2026-10-12', '2026-10-18')),
  100.00::numeric,
  'IVA 23% e IRS 23% (omissão): recebe o Total líquido'
);

select is(
  (select liquido from public.motorista_extrato_periodo('00000000-0000-0000-0000-0000004e0a03', '2026-10-12', '2026-10-18')),
  206.00::numeric,
  'IVA 23% e IRS 20% da ficha: 200 + 46 - 40'
);

select throws_ok(
  $$update public.motoristas_ativos set retencao_irs_pct = 150 where id = '00000000-0000-0000-0000-0000004e0a03'$$,
  '23514',
  null,
  'taxa acima de 100% é recusada'
);

select * from finish();
rollback;
