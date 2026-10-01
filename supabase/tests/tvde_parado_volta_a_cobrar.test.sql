-- ============================================================
-- Um TVDE em curso parado por uma data de fim antiga volta a cobrar: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Reproduz o Boota Singh (#802, 2026-10-01): TVDE em curso com a data de fim
-- de legado a 16-06, sem aluguer desde então. Ver a migração 20261001190000.
--   (1) reabre numa versão nova a começar a 20-09 (cobra desde 21-09), sem
--       fim, com o mesmo código e a mesma próxima renovação; a versão que sai
--       fica com o fim antigo;
--   (2) o condutor principal da versão nova começa com ela (é o que o fecho
--       da semana lê) e a atribuição à viatura também; a ficha do motorista
--       continua activa;
--   (3) a versão nova não emite "contrato criado" nem deixa entrega por fazer;
--   (4) não reabre quem já não tem o carro: ficha inactiva, viatura noutro
--       contrato, viatura atribuída a outro, o mesmo motorista já reaberto
--       noutro contrato; nem um contrato que não está parado;
--   (5) só o dono da base chama as duas funções.
-- As datas são fixas e anteriores a hoje: o resultado não depende do dia.
-- ============================================================

begin;
select plan(17);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação".
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000002e00ff', 'bootstrap@tvde-parado.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000002e0000', 'Org TVDE Parado', 'tvde-parado');

-- Autor dos contratos: a cascata cria eventos de calendário com criado_por
-- obrigatório, e aqui não há auth.uid().
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000002e0a01', 'gestor@tvde-parado.pt');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000002e0aa1', '00000000-0000-0000-0000-0000002e0000', 'Toyota');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000002e0ab1', '00000000-0000-0000-0000-0000002e0000',
   '00000000-0000-0000-0000-0000002e0aa1', 'Corolla');
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id)
select ('00000000-0000-0000-0000-0000002e0e0' || n)::uuid, '00000000-0000-0000-0000-0000002e0000',
       'TP-0' || n || '-AA', '00000000-0000-0000-0000-0000002e0aa1', '00000000-0000-0000-0000-0000002e0ab1'
  from generate_series(1, 5) as n;

-- O cliente não está ligado a motorista nenhum: as atribuições nascem só dos
-- condutores, como no contrato de um motorista TVDE.
insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000002e0c01', '00000000-0000-0000-0000-0000002e0000', 'Cliente TVDE');

insert into public.motoristas_ativos (id, org_id, nome, status_ativo) values
  ('00000000-0000-0000-0000-0000002e0d01', '00000000-0000-0000-0000-0000002e0000', 'Boota Singh', true),
  ('00000000-0000-0000-0000-0000002e0d02', '00000000-0000-0000-0000-0000002e0000', 'Saiu Da Frota', false),
  ('00000000-0000-0000-0000-0000002e0d03', '00000000-0000-0000-0000-0000002e0000', 'Carro Noutro Contrato', true),
  ('00000000-0000-0000-0000-0000002e0d04', '00000000-0000-0000-0000-0000002e0000', 'Contrato Normal', true),
  ('00000000-0000-0000-0000-0000002e0d05', '00000000-0000-0000-0000-0000002e0000', 'Carro Com Outro', true),
  ('00000000-0000-0000-0000-0000002e0d06', '00000000-0000-0000-0000-0000002e0000', 'Anda Com O Carro', true);

-- reserva_id é obrigatório; 'concluida' porque já virou contrato.
insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado)
select ('00000000-0000-0000-0000-0000002e0f0' || n)::uuid, '00000000-0000-0000-0000-0000002e0000',
       990100 + n, timestamptz '2026-05-01 10:00+00', ('00000000-0000-0000-0000-0000002e0e0' || v)::uuid,
       '00000000-0000-0000-0000-0000002e0c01', 'concluida'
  from (values (1, 1), (2, 2), (3, 3), (4, 3), (6, 4), (7, 5)) as x(n, v);

-- Os contratos parados têm a data de fim de legado: trg_a_tvde_nasce_sem_data_fim
-- desviava-a para a próxima renovação, por isso fica desligada só aqui.
alter table public.contratos_renting disable trigger trg_a_tvde_nasce_sem_data_fim;

insert into public.contratos_renting
  (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   proxima_renovacao_em, estado_operacional, estado_financeiro, regime, taxa_iva,
   is_longa_duracao, created_by)
select ('00000000-0000-0000-0000-0000002e0b0' || n)::uuid, '00000000-0000-0000-0000-0000002e0000',
       990100 + n, ('00000000-0000-0000-0000-0000002e0f0' || n)::uuid,
       '00000000-0000-0000-0000-0000002e0c01', ('00000000-0000-0000-0000-0000002e0e0' || v)::uuid,
       'TP-0' || v || '-AA', inicio, fim, fim, 'em_curso', 'pendente', 'tvde', 23, true,
       '00000000-0000-0000-0000-0000002e0a01'
  from (values
    -- #990101 Boota Singh, parado desde 16-06.
    (1, 1, timestamptz '2026-05-01 10:00+00', timestamptz '2026-06-16 10:00+00'),
    -- #990102 ficha inactiva.
    (2, 2, timestamptz '2026-05-01 10:00+00', timestamptz '2026-06-16 10:00+00'),
    -- #990103 parado, mas o carro está desde julho no #990104.
    (3, 3, timestamptz '2026-05-01 10:00+00', timestamptz '2026-06-20 10:00+00'),
    -- #990104 contrato normal, sem fim.
    (4, 3, timestamptz '2026-07-01 10:00+00', null::timestamptz),
    -- #990106 outro contrato parado do Boota, noutro carro, parado há menos tempo.
    (6, 4, timestamptz '2026-07-01 10:00+00', timestamptz '2026-08-01 10:00+00'),
    -- #990107 parado, mas a frota tem outro motorista com o carro.
    (7, 5, timestamptz '2026-05-01 10:00+00', timestamptz '2026-07-15 10:00+00')
  ) as x(n, v, inicio, fim);

alter table public.contratos_renting enable trigger trg_a_tvde_nasce_sem_data_fim;

insert into public.contrato_condutores (org_id, contrato_id, motorista_id, is_principal, data_inicio)
select '00000000-0000-0000-0000-0000002e0000', ('00000000-0000-0000-0000-0000002e0b0' || n)::uuid,
       ('00000000-0000-0000-0000-0000002e0d0' || m)::uuid, true, inicio
  from (values (1, 1, timestamptz '2026-05-01 10:00+00'),
               (2, 2, timestamptz '2026-05-01 10:00+00'),
               (3, 3, timestamptz '2026-05-01 10:00+00'),
               (4, 4, timestamptz '2026-07-01 10:00+00'),
               (6, 1, timestamptz '2026-07-01 10:00+00'),
               (7, 5, timestamptz '2026-05-01 10:00+00')) as x(n, m, inicio);

-- A frota tem outro motorista com o carro do #990107 desde 01-09.
insert into public.motorista_viaturas (motorista_id, viatura_id, data_inicio, status, org_id, observacoes) values
  ('00000000-0000-0000-0000-0000002e0d06', '00000000-0000-0000-0000-0000002e0e05',
   date '2026-09-01', 'ativo', '00000000-0000-0000-0000-0000002e0000', 'Atribuição manual');

-- ── (4) Quem não reabre, e porquê ──────────────────────────

select is(
  public.motivo_tvde_parado_nao_reabre('00000000-0000-0000-0000-0000002e0b01', '2026-09-20 12:00+00'),
  null,
  '#990101 (Boota Singh) pode reabrir'
);

select is(
  public.motivo_tvde_parado_nao_reabre('00000000-0000-0000-0000-0000002e0b02', '2026-09-20 12:00+00'),
  'motorista principal com a ficha inactiva',
  'ficha inactiva: não reabre'
);

select is(
  public.motivo_tvde_parado_nao_reabre('00000000-0000-0000-0000-0000002e0b03', '2026-09-20 12:00+00'),
  'viatura já no contrato #990104',
  'carro já noutro contrato: não reabre'
);

select is(
  public.motivo_tvde_parado_nao_reabre('00000000-0000-0000-0000-0000002e0b04', '2026-09-20 12:00+00'),
  'não está parado: não tem data de fim',
  'um contrato normal, sem fim, não é tocado'
);

select is(
  public.motivo_tvde_parado_nao_reabre('00000000-0000-0000-0000-0000002e0b07', '2026-09-20 12:00+00'),
  'viatura atribuída a Anda Com O Carro',
  'a frota tem outro motorista com o carro: não reabre'
);

select throws_ok(
  $$select public.reabrir_tvde_parado('00000000-0000-0000-0000-0000002e0b02', '2026-09-20 12:00+00')$$,
  '23514',
  'Contrato #990102 não reabre: motorista principal com a ficha inactiva',
  'reabrir recusa um contrato que não pode reabrir'
);

-- ── (1) Reabrir o do Boota ─────────────────────────────────

create temp table versao_nova as
select public.reabrir_tvde_parado('00000000-0000-0000-0000-0000002e0b01', '2026-09-20 12:00+00') as id;

select ok(
  (select substituido_em is not null
          and estado_operacional = 'fechado'
          and data_fim = timestamptz '2026-06-16 10:00+00'
     from public.contratos_renting where id = '00000000-0000-0000-0000-0000002e0b01'),
  'a versão que sai fecha e guarda o fim antigo (até onde já se cobrou)'
);

select ok(
  (select codigo = 990101
          and versao = 2
          and contrato_anterior_id = '00000000-0000-0000-0000-0000002e0b01'
          and data_inicio = timestamptz '2026-09-20 12:00+00'
          and data_fim is null
          and estado_operacional = 'em_curso'
          and regime = 'tvde'
          and proxima_renovacao_em = timestamptz '2026-06-16 10:00+00'
     from public.contratos_renting where id = (select id from versao_nova)),
  'a versão nova: mesmo código, começa a 20-09, sem fim, em curso, mesma próxima renovação'
);

select ok(
  (select periodo @> timestamptz '2026-09-21 12:00+00' and periodo @> now()
     from public.contratos_renting where id = (select id from versao_nova)),
  'a versão nova cobre a semana de 21-09 e continua a cobrir hoje'
);

-- ── (2) Condutor e atribuição ──────────────────────────────

select is(
  (select motorista_id::text || ' desde ' || data_inicio::text
     from public.contrato_condutores
    where contrato_id = (select id from versao_nova) and is_principal and data_fim is null),
  '00000000-0000-0000-0000-0000002e0d01 desde ' || timestamptz '2026-09-20 12:00+00'::text,
  'o principal da versão nova é o mesmo motorista e começa com ela'
);

select is(
  (select data_inicio::text || ' / ' || status || ' / ' || coalesce(data_fim::text, 'sem fim')
     from public.motorista_viaturas
    where motorista_id = '00000000-0000-0000-0000-0000002e0d01'
      and viatura_id = '00000000-0000-0000-0000-0000002e0e01'
    order by data_inicio desc, created_at desc
    limit 1),
  '2026-09-20 / ativo / sem fim',
  'o motorista fica atribuído ao carro desde 20-09, sem fim'
);

-- contrato_renting_inativar_motorista_na_devolucao desactiva a ficha quando um
-- contrato fecha, excepto se for substituído no mesmo UPDATE.
select is(
  (select status_ativo from public.motoristas_ativos where id = '00000000-0000-0000-0000-0000002e0d01'),
  true,
  'fechar a versão antiga não desactiva a ficha do motorista'
);

-- ── (3) Sem efeitos de um contrato novo ────────────────────

select is(
  (select count(*)::int from public.domain_events
    where entity_id = (select id from versao_nova) and event_type = 'contrato_renting.criado'),
  0,
  'a versão nova não emite "contrato criado" (nem email ao motorista)'
);

select is(
  (select count(*)::int from public.calendario_eventos
    where origem_tipo = 'contrato_renting' and origem_id = (select id from versao_nova)
      and tipo in ('entrega', 'recolha') and realizado_em is null),
  0,
  'a versão nova não deixa entrega por fazer no calendário'
);

-- ── Depois de reabrir ──────────────────────────────────────

select is(
  public.motivo_tvde_parado_nao_reabre('00000000-0000-0000-0000-0000002e0b06', '2026-09-20 12:00+00'),
  'motorista já no contrato #990101',
  'o outro contrato parado do mesmo motorista já não reabre (não se cobram dois carros)'
);

select ok(
  exists (select 1 from public.contrato_historico
           where contrato_id = '00000000-0000-0000-0000-0000002e0b01'
             and detalhe like '%sem cobrar a viatura desde 16/06/2026%'
             and detalhe like '%cobra desde 21/09/2026%'),
  'o histórico do contrato diz desde quando estava parado e desde quando volta a cobrar'
);

-- ── (5) ────────────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.motivo_tvde_parado_nao_reabre(uuid, timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.motivo_tvde_parado_nao_reabre(uuid, timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.reabrir_tvde_parado(uuid, timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reabrir_tvde_parado(uuid, timestamptz)', 'EXECUTE'),
  'motivo_tvde_parado_nao_reabre e reabrir_tvde_parado: fora da API'
);

select * from finish();
rollback;
