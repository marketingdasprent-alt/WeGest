-- ============================================================
-- Troca de viatura num contrato cuja data_fim já passou
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- O contrato #577 era TVDE de longa duração com data_fim em 2025-12-29. Em
-- 2026-08-28 o gestor trocou-lhe a viatura e apanhou "Erro inesperado" cinco
-- vezes seguidas. Por baixo, criar_versao_contrato_renting montava o sucessor
-- com data_inicio = data da troca e data_fim = a data antiga — período
-- invertido, que a coluna gerada `periodo` (tstzrange) recusa com 22000
-- "range lower bound must be less than or equal to range upper bound".
--
-- Estes testes fixam as três situações que a regra nova distingue.
-- ============================================================

begin;
select plan(7);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0000', 'Org Troca Expirada', 'troca-exp');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0a01', 'gestor@troca-exp.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0000', true);

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0000');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0000', 'Cliente Troca Expirada');

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-0000000f0e01', '00000000-0000-0000-0000-0000000f0000', 'TX-11-TX', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000f0e02', '00000000-0000-0000-0000-0000000f0000', 'TX-22-TX', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000f0e03', '00000000-0000-0000-0000-0000000f0000', 'TX-33-TX', 'Toyota', 'Corolla');

-- A: o caso do #577 — TVDE longa duração, renovação de 30 dias, terminado há
--    8 meses, mas com a viatura ainda na rua.
insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias)
values
  ('00000000-0000-0000-0000-0000000fc501', '00000000-0000-0000-0000-0000000f0000',
   '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0e01', 'TX-11-TX',
   now() - interval '270 days', now() - interval '240 days',
   'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30);

-- B: rent-a-car de período fixo, também já terminado, sem regra de renovação.
insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao)
values
  ('00000000-0000-0000-0000-0000000fc502', '00000000-0000-0000-0000-0000000f0000',
   '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0e02', 'TX-22-TX',
   now() - interval '90 days', now() - interval '60 days',
   'em_curso', 'pendente', 'rent_a_car', 23, false);

-- C: contrato ainda dentro do prazo — o comportamento antigo não pode mudar.
insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao)
values
  ('00000000-0000-0000-0000-0000000fc503', '00000000-0000-0000-0000-0000000f0000',
   '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0e03', 'TX-33-TX',
   now() - interval '5 days', now() + interval '25 days',
   'em_curso', 'pendente', 'rent_a_car', 23, false);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f0a01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f0a01","role":"authenticated"}', true);

-- ── A: longa duração expirada — a troca passa, com período recalculado ──
select lives_ok(
  $$select public.criar_versao_contrato_renting(
      '00000000-0000-0000-0000-0000000fc501', 'Manutenção', now())$$,
  'troca de viatura num contrato de longa duração já expirado não rebenta'
);

-- O sucessor existe e começa na data da troca.
select is(
  (select count(*)::int from public.contratos_renting
    where contrato_anterior_id = '00000000-0000-0000-0000-0000000fc501'),
  1,
  'o contrato sucessor foi mesmo criado'
);

-- E o fim é o que proxima_data_renovacao() dita — a mesma regra que a
-- renovação usa, não uma data inventada aqui.
select is(
  (select date_trunc('minute', data_fim) from public.contratos_renting
    where contrato_anterior_id = '00000000-0000-0000-0000-0000000fc501'),
  (select date_trunc('minute', public.proxima_data_renovacao(data_inicio, 'intervalo_dias', 30))
     from public.contratos_renting
    where contrato_anterior_id = '00000000-0000-0000-0000-0000000fc501'),
  'o fim do sucessor sai de proxima_data_renovacao(), a partir da data da troca'
);

-- A invariante que faltava: o período nunca fica invertido.
select ok(
  (select data_fim > data_inicio from public.contratos_renting
    where contrato_anterior_id = '00000000-0000-0000-0000-0000000fc501'),
  'o sucessor nasce com data_fim depois de data_inicio'
);

-- ── B: sem regra de renovação — recusa explícita, não erro cru ──
select throws_ok(
  $$select public.criar_versao_contrato_renting(
      '00000000-0000-0000-0000-0000000fc502', 'Avaria', now())$$,
  '23514',
  null,
  'contrato expirado sem regra de renovação é recusado, em vez de rebentar no tstzrange'
);

select throws_like(
  $$select public.criar_versao_contrato_renting(
      '00000000-0000-0000-0000-0000000fc502', 'Avaria', now())$$,
  '%antes de trocar a viatura%',
  'a recusa diz ao gestor o que fazer a seguir'
);

-- ── C: contrato dentro do prazo — herda a data_fim como sempre herdou ──
select public.criar_versao_contrato_renting(
  '00000000-0000-0000-0000-0000000fc503', 'Upgrade de grupo', now());

select is(
  (select c.data_fim from public.contratos_renting c
    where c.contrato_anterior_id = '00000000-0000-0000-0000-0000000fc503'),
  (select now() + interval '25 days')::timestamptz,
  'contrato ainda em prazo continua a herdar a data_fim original'
);

rollback;
