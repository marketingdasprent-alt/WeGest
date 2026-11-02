-- ============================================================
-- Seguro semanal automático (pgTAP)
-- ============================================================
-- A 02/11/2026 o cron gerar-seguros-semanais não existia em produção: o
-- "Seguro semanal (€)" da ficha nunca foi debitado sozinho. Fixa o cron e que
-- gerar_seguros_semanais() não cobra por cima de recorrência ativa nem de
-- seguro já lançado na semana.
-- ============================================================

begin;
select plan(7);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000005e001', 'Org Seguro Auto', 'seguro-auto');

insert into public.motoristas_ativos (id, org_id, nome, status_ativo, seguro_valor_semanal) values
  ('00000000-0000-0000-0000-00000005ec01', '00000000-0000-0000-0000-00000005e001', 'Seguro Normal', true, 31.49),
  ('00000000-0000-0000-0000-00000005ec02', '00000000-0000-0000-0000-00000005e001', 'Seguro Recorrencia', true, 30),
  ('00000000-0000-0000-0000-00000005ec03', '00000000-0000-0000-0000-00000005e001', 'Seguro Manual', true, 30),
  ('00000000-0000-0000-0000-00000005ec04', '00000000-0000-0000-0000-00000005e001', 'Seguro Inativo', false, 150);

insert into public.motorista_financeiro_recorrencias
  (org_id, motorista_id, tipo, categoria, descricao, valor, frequencia, semana_ancora, status) values
  ('00000000-0000-0000-0000-00000005e001', '00000000-0000-0000-0000-00000005ec02', 'debito', 'seguros', 'seguro', 30, 'semanal', date_trunc('week', current_date)::date, 'ativa');

insert into public.motorista_financeiro
  (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
  ('00000000-0000-0000-0000-00000005e001', '00000000-0000-0000-0000-00000005ec03', 'debito', 'seguros', 'manual', 30, date_trunc('week', current_date)::date + 2, 'pendente');

select ok(
  exists (select 1 from cron.job where jobname = 'gerar-seguros-semanais' and active
            and command like '%gerar_seguros_semanais%'),
  'cron gerar-seguros-semanais existe e está activo'
);

select is(public.gerar_seguros_semanais(0), 1, 'lança só o motorista elegível');

select results_eq(
  $$ select valor, data_movimento, categoria, tipo, status
       from public.motorista_financeiro
      where motorista_id = '00000000-0000-0000-0000-00000005ec01' $$,
  $$ values (31.49::numeric, date_trunc('week', current_date)::date, 'seguros'::text, 'debito'::text, 'pendente'::text) $$,
  'débito de seguro na segunda-feira da semana, com o valor da ficha'
);

select is(
  (select count(*)::int from public.motorista_financeiro where motorista_id = '00000000-0000-0000-0000-00000005ec02'),
  0, 'motorista com recorrência de seguro ativa não é cobrado duas vezes'
);

select is(
  (select count(*)::int from public.motorista_financeiro where motorista_id = '00000000-0000-0000-0000-00000005ec03'),
  1, 'seguro já lançado na semana não é duplicado'
);

select is(
  (select count(*)::int from public.motorista_financeiro where motorista_id = '00000000-0000-0000-0000-00000005ec04'),
  0, 'motorista inativo não é cobrado'
);

select is(public.gerar_seguros_semanais(0), 0, 'segunda corrida na mesma semana não duplica');

select * from finish();
rollback;
