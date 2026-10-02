-- ============================================================
-- TVDE reaberto à mão cobra desde 21-09: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Reproduz o Boota Singh (#802, 2026-10-02): a versão anterior acabou a 16-06,
-- alguém carregou em "Renovar" e a versão viva começa a 01-10, por isso a
-- semana de 21-09 não tem contrato. Ver a migração 20261002100000.
--   (1) recua o início da versão viva, o do condutor principal e o da
--       atribuição à viatura para 20-09 (cobra desde 21-09), e regista-o;
--   (2) não repete: depois de corrigido, já cobre a semana;
--   (3) não toca em quem não é uma reabertura, em quem tem a ficha inactiva,
--       nem quando outro contrato ocupa a viatura nesse intervalo;
--   (4) de vez: um TVDE reaberto por "Renovar" depois de parado nasce a começar
--       na semana anterior e não hoje; uma versão qualquer mantém a data;
--   (5) só o dono da base chama a função.
-- As datas são fixas: o resultado não depende do dia.
-- ============================================================

begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000003e00ff', 'bootstrap@tvde-reaberto.pt'),
  ('00000000-0000-0000-0000-0000003e0a01', 'gestor@tvde-reaberto.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000003e0000', 'Org TVDE Reaberto', 'tvde-reaberto');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000003e0aa1', '00000000-0000-0000-0000-0000003e0000', 'Toyota');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000003e0ab1', '00000000-0000-0000-0000-0000003e0000',
   '00000000-0000-0000-0000-0000003e0aa1', 'Corolla');
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id)
select ('00000000-0000-0000-0000-0000003e0e0' || n)::uuid, '00000000-0000-0000-0000-0000003e0000',
       'TR-0' || n || '-AA', '00000000-0000-0000-0000-0000003e0aa1', '00000000-0000-0000-0000-0000003e0ab1'
  from generate_series(1, 6) as n;

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000003e0c01', '00000000-0000-0000-0000-0000003e0000', 'Cliente TVDE');

insert into public.motoristas_ativos (id, org_id, nome, status_ativo) values
  ('00000000-0000-0000-0000-0000003e0d01', '00000000-0000-0000-0000-0000003e0000', 'Boota Singh', true),
  ('00000000-0000-0000-0000-0000003e0d02', '00000000-0000-0000-0000-0000003e0000', 'Viatura Ocupada', true),
  ('00000000-0000-0000-0000-0000003e0d03', '00000000-0000-0000-0000-0000003e0000', 'Saiu Da Frota', false),
  ('00000000-0000-0000-0000-0000003e0d04', '00000000-0000-0000-0000-0000003e0000', 'Sem Versao Anterior', true);

insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado)
select ('00000000-0000-0000-0000-0000003e0f0' || n)::uuid, '00000000-0000-0000-0000-0000003e0000',
       990200 + n, timestamptz '2026-05-01 10:00+00',
       ('00000000-0000-0000-0000-0000003e0e0' || v)::uuid,
       '00000000-0000-0000-0000-0000003e0c01', 'concluida'
  from (values (1, 1), (2, 2), (3, 3), (4, 4), (5, 2), (6, 5), (7, 6)) as x(n, v);

-- trg_a_tvde_nasce_sem_data_fim limpa a data de fim ao inserir: fica desligado
-- só enquanto entram as versões antigas, que têm o fim de legado.
alter table public.contratos_renting disable trigger trg_a_tvde_nasce_sem_data_fim;

-- Versões antigas, já substituídas, com o fim de legado.
insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   proxima_renovacao_em, estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, substituido_em, versao, created_by)
select ('00000000-0000-0000-0000-0000003e0b1' || n)::uuid, '00000000-0000-0000-0000-0000003e0000',
       990200 + n, ('00000000-0000-0000-0000-0000003e0f0' || n)::uuid,
       '00000000-0000-0000-0000-0000003e0c01', ('00000000-0000-0000-0000-0000003e0e0' || n)::uuid,
       'TR-0' || n || '-AA', timestamptz '2026-05-17 10:00+00', timestamptz '2026-06-16 10:00+00',
       timestamptz '2026-06-16 10:00+00', 'fechado', 'pendente', 'tvde', 23, true,
       timestamptz '2026-10-01 10:00+00', 2, '00000000-0000-0000-0000-0000003e0a01'
  from generate_series(1, 3) as n;

-- Outro contrato ocupa a viatura 2 entre 25-09 e 30-09 (rent-a-car mantém o fim).
insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, created_by)
values
  ('00000000-0000-0000-0000-0000003e0b24', '00000000-0000-0000-0000-0000003e0000', 990204,
   '00000000-0000-0000-0000-0000003e0f05', '00000000-0000-0000-0000-0000003e0c01',
   '00000000-0000-0000-0000-0000003e0e02', 'TR-02-AA', timestamptz '2026-06-20 10:00+00',
   timestamptz '2026-09-30 10:00+00', 'em_curso', 'pendente', 'rent_a_car', 23,
   '00000000-0000-0000-0000-0000003e0a01');

-- Versões anteriores das duas viaturas do gatilho (fim de legado a 16-06).
insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   proxima_renovacao_em, estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, substituido_em, versao, created_by)
select ('00000000-0000-0000-0000-0000003e0b3' || n)::uuid, '00000000-0000-0000-0000-0000003e0000',
       990300 + n, ('00000000-0000-0000-0000-0000003e0f0' || (n + 1))::uuid,
       '00000000-0000-0000-0000-0000003e0c01', ('00000000-0000-0000-0000-0000003e0e0' || (n + 4))::uuid,
       'TR-0' || (n + 4) || '-AA', timestamptz '2026-05-17 10:00+00', timestamptz '2026-06-16 10:00+00',
       timestamptz '2026-06-16 10:00+00', 'fechado', 'pendente', 'tvde', 23, true,
       now(), 2, '00000000-0000-0000-0000-0000003e0a01'
  from generate_series(1, 2) as n;

alter table public.contratos_renting enable trigger trg_a_tvde_nasce_sem_data_fim;

-- Versões vivas, abertas a 01-10. A do #990204 não tem versão anterior.
insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   proxima_renovacao_em, estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, versao, contrato_anterior_id, motivo_versao, created_by)
select ('00000000-0000-0000-0000-0000003e0b2' || n)::uuid, '00000000-0000-0000-0000-0000003e0000',
       990200 + n, ('00000000-0000-0000-0000-0000003e0f0' || n)::uuid,
       '00000000-0000-0000-0000-0000003e0c01', ('00000000-0000-0000-0000-0000003e0e0' || n)::uuid,
       'TR-0' || n || '-AA', timestamptz '2026-10-01 10:00+00', null::timestamptz,
       timestamptz '2026-10-14 10:00+00', 'em_curso', 'pendente', 'tvde', 23, true, 3,
       ('00000000-0000-0000-0000-0000003e0b1' || n)::uuid,
       'Versao aberta a 01/10/2026 (fixture: o gatilho so recua os reaberto)', '00000000-0000-0000-0000-0000003e0a01'
  from generate_series(1, 3) as n;

insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   proxima_renovacao_em, estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, created_by)
values
  ('00000000-0000-0000-0000-0000003e0b2a', '00000000-0000-0000-0000-0000003e0000', 990299,
   '00000000-0000-0000-0000-0000003e0f04', '00000000-0000-0000-0000-0000003e0c01',
   '00000000-0000-0000-0000-0000003e0e04', 'TR-04-AA', timestamptz '2026-10-01 10:00+00', null,
   timestamptz '2026-10-14 10:00+00', 'em_curso', 'pendente', 'tvde', 23, true,
   '00000000-0000-0000-0000-0000003e0a01');

insert into public.contrato_condutores (org_id, contrato_id, motorista_id, is_principal, data_inicio) values
  ('00000000-0000-0000-0000-0000003e0000', '00000000-0000-0000-0000-0000003e0b21',
   '00000000-0000-0000-0000-0000003e0d01', true, timestamptz '2026-10-01 10:00+00'),
  ('00000000-0000-0000-0000-0000003e0000', '00000000-0000-0000-0000-0000003e0b22',
   '00000000-0000-0000-0000-0000003e0d02', true, timestamptz '2026-10-01 10:00+00'),
  ('00000000-0000-0000-0000-0000003e0000', '00000000-0000-0000-0000-0000003e0b23',
   '00000000-0000-0000-0000-0000003e0d03', true, timestamptz '2026-10-01 10:00+00'),
  ('00000000-0000-0000-0000-0000003e0000', '00000000-0000-0000-0000-0000003e0b2a',
   '00000000-0000-0000-0000-0000003e0d04', true, timestamptz '2026-10-01 10:00+00');

-- A atribuição do Boota, como a criam os automatismos.
update public.motorista_viaturas
   set data_inicio = date '2026-10-01', status = 'ativo', data_fim = null
 where motorista_id = '00000000-0000-0000-0000-0000003e0d01'
   and viatura_id = '00000000-0000-0000-0000-0000003e0e01';
insert into public.motorista_viaturas (motorista_id, viatura_id, data_inicio, status, org_id, observacoes)
select '00000000-0000-0000-0000-0000003e0d01', '00000000-0000-0000-0000-0000003e0e01',
       date '2026-10-01', 'ativo', '00000000-0000-0000-0000-0000003e0000',
       'Gerado ao associar condutor ao contrato #990201'
 where not exists (select 1 from public.motorista_viaturas
                    where motorista_id = '00000000-0000-0000-0000-0000003e0d01'
                      and viatura_id = '00000000-0000-0000-0000-0000003e0e01'
                      and data_inicio = date '2026-10-01');

-- ── (3) O que fica como está ───────────────────────────────

select is(
  public.corrigir_inicio_tvde_reaberto('00000000-0000-0000-0000-0000003e0b22', '2026-09-20 12:00+00'),
  'viatura já no contrato #990204',
  'viatura ocupada por outro contrato no intervalo: não mexe'
);

select is(
  public.corrigir_inicio_tvde_reaberto('00000000-0000-0000-0000-0000003e0b23', '2026-09-20 12:00+00'),
  'motorista principal com a ficha inactiva',
  'ficha inactiva: não mexe'
);

select is(
  public.corrigir_inicio_tvde_reaberto('00000000-0000-0000-0000-0000003e0b2a', '2026-09-20 12:00+00'),
  'não é uma reabertura',
  'sem versão anterior: não mexe'
);

select is(
  (select data_inicio from public.contratos_renting where id = '00000000-0000-0000-0000-0000003e0b22'),
  timestamptz '2026-10-01 10:00+00',
  'o que ficou como está não mudou de data'
);

-- ── (1) O Boota ────────────────────────────────────────────

select is(
  public.corrigir_inicio_tvde_reaberto('00000000-0000-0000-0000-0000003e0b21', '2026-09-20 12:00+00'),
  null,
  'o contrato do Boota corrige'
);

select is(
  (select data_inicio from public.contratos_renting where id = '00000000-0000-0000-0000-0000003e0b21'),
  timestamptz '2026-09-20 12:00+00',
  'a versão viva começa a 20-09 (cobra desde 21-09)'
);

select ok(
  (select periodo @> timestamptz '2026-09-21 12:00+00' and periodo @> now()
     from public.contratos_renting where id = '00000000-0000-0000-0000-0000003e0b21'),
  'cobre a semana de 21-09 e continua a cobrir hoje'
);

select is(
  (select data_inicio from public.contrato_condutores
    where contrato_id = '00000000-0000-0000-0000-0000003e0b21' and is_principal),
  timestamptz '2026-09-20 12:00+00',
  'o condutor principal começa com a versão'
);

select is(
  (select min(data_inicio)::text from public.motorista_viaturas
    where motorista_id = '00000000-0000-0000-0000-0000003e0d01'
      and viatura_id = '00000000-0000-0000-0000-0000003e0e01'),
  '2026-09-20',
  'a atribuição à viatura começa a 20-09'
);

-- ── (2) e histórico ────────────────────────────────────────

select is(
  public.corrigir_inicio_tvde_reaberto('00000000-0000-0000-0000-0000003e0b21', '2026-09-20 12:00+00'),
  'já cobre a semana',
  'segunda vez não faz nada'
);

-- ── (4) O gatilho ──────────────────────────────────────────

-- Reabertura por Renovar, hoje: nasce na semana anterior (domingo, 12:00 UTC).
insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao, versao,
   contrato_anterior_id, motivo_versao, created_by)
values
  ('00000000-0000-0000-0000-0000003e0b41', '00000000-0000-0000-0000-0000003e0000', 990301,
   '00000000-0000-0000-0000-0000003e0f06', '00000000-0000-0000-0000-0000003e0c01',
   '00000000-0000-0000-0000-0000003e0e05', 'TR-05-AA', now(), null, 'em_curso', 'pendente', 'tvde',
   23, true, 3, '00000000-0000-0000-0000-0000003e0b31',
   'Renovacao: reaberto a hoje; tinha terminado a 16/06', '00000000-0000-0000-0000-0000003e0a01'),
  ('00000000-0000-0000-0000-0000003e0b42', '00000000-0000-0000-0000-0000003e0000', 990302,
   '00000000-0000-0000-0000-0000003e0f07', '00000000-0000-0000-0000-0000003e0c01',
   '00000000-0000-0000-0000-0000003e0e06', 'TR-06-AA', timestamptz '2026-10-01 10:00+00', null,
   'em_curso', 'pendente', 'tvde', 23, true, 3, '00000000-0000-0000-0000-0000003e0b32',
   'Outro motivo qualquer', '00000000-0000-0000-0000-0000003e0a01');

select is(
  (select data_inicio from public.contratos_renting where id = '00000000-0000-0000-0000-0000003e0b41'),
  (((date_trunc('week', now() at time zone 'Europe/Lisbon'))::date - 8)::timestamp + interval '12 hours') at time zone 'UTC',
  'reaberto por Renovar: nasce na semana anterior e não hoje'
);

select is(
  (select data_inicio from public.contratos_renting where id = '00000000-0000-0000-0000-0000003e0b42'),
  timestamptz '2026-10-01 10:00+00',
  'outra versão qualquer mantém a data'
);

-- ── (5) ────────────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.corrigir_inicio_tvde_reaberto(uuid, timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.corrigir_inicio_tvde_reaberto(uuid, timestamptz)', 'EXECUTE'),
  'corrigir_inicio_tvde_reaberto: fora da API'
);

select * from finish();
rollback;
