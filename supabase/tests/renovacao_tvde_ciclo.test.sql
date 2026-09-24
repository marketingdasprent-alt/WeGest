-- ============================================================
-- Renovar TVDE segue o ciclo, com janela de 7 dias (20260924180000)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Tudo relativo a now(): nada depende do dia da semana nem da data de hoje.
-- ============================================================

begin;
select plan(12);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0000', 'Org Ciclo TVDE', 'ciclo-tvde');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0a01', 'gestor@ciclo-tvde.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0000', true);

delete from public.user_org_ativa where user_id = '00000000-0000-0000-0000-0000000f0a01';
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0000');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0000', 'Cliente Ciclo');

insert into public.viaturas (id, org_id, matricula, marca, modelo, km_atual) values
  ('00000000-0000-0000-0000-0000000f0e01', '00000000-0000-0000-0000-0000000f0000', 'CI-01-CI', 'Toyota', 'Corolla', 1000),
  ('00000000-0000-0000-0000-0000000f0e02', '00000000-0000-0000-0000-0000000f0000', 'CI-02-CI', 'Toyota', 'Corolla', 1000),
  ('00000000-0000-0000-0000-0000000f0e03', '00000000-0000-0000-0000-0000000f0000', 'CI-03-CI', 'Toyota', 'Corolla', 1000);

insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, matricula, data_inicio, proxima_renovacao_em,
   estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias, kms_incluidos, km_adicional_valor)
values
  -- A: mesmo dia de cada mês, renovado 3 dias atrasado.
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000f0000',
   '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0e01', 'CI-01-CI',
   now() - interval '40 days', now() - interval '3 days',
   'em_curso', 'pendente', 'tvde', 23, true, 'mesmo_dia_cada_mes', null, null, null),
  -- B: intervalo de 30 dias, renovado 5 dias adiantado (dentro da janela).
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0000',
   '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0e02', 'CI-02-CI',
   now() - interval '25 days', now() + interval '5 days',
   'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30, null, null),
  -- C: prazo daqui a 20 dias, com limite de km — fora da janela.
  ('00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-0000000f0000',
   '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0e03', 'CI-03-CI',
   now() - interval '10 days', now() + interval '20 days',
   'em_curso', 'pendente', 'tvde', 23, true, 'intervalo_dias', 30, 100, 0.5);

create temp table antes on commit drop as
  select id, proxima_renovacao_em from public.contratos_renting
   where org_id = '00000000-0000-0000-0000-0000000f0000';

-- ── Função do ciclo ────────────────────────────────────────

select is(
  public.proxima_renovacao_no_ciclo('2026-01-31T10:00:00Z', 'mesmo_dia_cada_mes', null, '2026-03-05T10:00:00Z'),
  '2026-03-31T09:00:00Z'::timestamptz,
  'mesmo dia: conta sempre da âncora — o 31 não escorrega para 28 e a hora local mantém-se'
);

select is(
  public.proxima_renovacao_no_ciclo('2025-05-26T10:00:00Z', 'intervalo_dias', 30, '2026-09-24T16:00:00Z'),
  '2026-10-18T10:00:00Z'::timestamptz,
  'intervalo: anos de atraso resolvem-se de uma vez, na ocorrência a seguir'
);

select is(
  public.proxima_renovacao_no_ciclo('2026-09-24T20:51:00Z', null, null, '2026-09-24T20:51:00Z'),
  '2026-10-24T20:51:00Z'::timestamptz,
  'sem opção nem intervalo: 30 dias, estritamente depois'
);

-- ── Renovar ────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f0a01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f0a01","role":"authenticated"}', true);

create temp table renovados (antigo uuid, novo uuid) on commit drop;

insert into renovados
  select '00000000-0000-0000-0000-0000000f0001',
         public.renovar_contrato_renting('00000000-0000-0000-0000-0000000f0001');

select is(
  (select c.proxima_renovacao_em from public.contratos_renting c
     join renovados r on r.novo = c.id where r.antigo = '00000000-0000-0000-0000-0000000f0001'),
  (select ((a.proxima_renovacao_em at time zone 'Europe/Lisbon') + interval '1 month') at time zone 'Europe/Lisbon'
     from antes a where a.id = '00000000-0000-0000-0000-0000000f0001'),
  'atrasado: a próxima fica no mesmo dia do ciclo, não a contar de hoje'
);

select ok(
  (select o.substituido_em is not null and o.estado_operacional = 'fechado' and o.data_fim = now()
          and n.versao = o.versao + 1 and n.codigo = o.codigo and n.contrato_anterior_id = o.id
          and n.data_inicio = now() and n.data_fim is null and n.estado_operacional = 'em_curso'
     from public.contratos_renting o, public.contratos_renting n, renovados r
    where r.antigo = '00000000-0000-0000-0000-0000000f0001' and o.id = r.antigo and n.id = r.novo),
  'renovar fecha o período na versão que sai e continua o contrato numa versão nova, sem fim'
);

insert into renovados
  select '00000000-0000-0000-0000-0000000f0002',
         public.renovar_contrato_renting('00000000-0000-0000-0000-0000000f0002');

select is(
  (select c.proxima_renovacao_em from public.contratos_renting c
     join renovados r on r.novo = c.id where r.antigo = '00000000-0000-0000-0000-0000000f0002'),
  (select ((a.proxima_renovacao_em at time zone 'Europe/Lisbon') + interval '30 days') at time zone 'Europe/Lisbon'
     from antes a where a.id = '00000000-0000-0000-0000-0000000f0002'),
  'adiantado dentro da janela: avança um ciclo a partir do prazo'
);

select throws_ok(
  format('select public.renovar_contrato_renting(%L)',
         (select novo from renovados where antigo = '00000000-0000-0000-0000-0000000f0002')),
  '23514',
  null,
  'um segundo clique na versão nova é recusado — não salta outro mês'
);

select throws_ok(
  $$ select public.renovar_contrato_renting('00000000-0000-0000-0000-0000000f0003', 1000, 2000) $$,
  '23514',
  null,
  'mais de 7 dias antes do prazo não se renova'
);

select is(
  (select km_atual from public.viaturas where id = '00000000-0000-0000-0000-0000000f0e03'),
  1000,
  'a recusa não mexe no km da viatura'
);

select ok(
  not exists (select 1 from public.contrato_extras where contrato_id = '00000000-0000-0000-0000-0000000f0003'),
  'nem lança km excedente'
);

select is(
  (select proxima_renovacao_em from public.contratos_renting where id = '00000000-0000-0000-0000-0000000f0003'),
  (select proxima_renovacao_em from antes where id = '00000000-0000-0000-0000-0000000f0003'),
  'e o prazo fica como estava'
);

-- ── Aviso diário ───────────────────────────────────────────
-- A foi renovado: o prazo virtual (início + 30 dias) já passou, mas manda
-- proxima_renovacao_em, que está no futuro.

select public.emit_contrato_renting_renovacao_events();

select is(
  (select count(*)::int from public.domain_events e
     join renovados r on r.novo = e.entity_id
    where r.antigo = '00000000-0000-0000-0000-0000000f0001'
      and e.event_type = 'contrato_renting.renovacao_proxima'),
  0,
  'um TVDE já renovado não recebe aviso de renovação'
);

select * from finish();
rollback;
