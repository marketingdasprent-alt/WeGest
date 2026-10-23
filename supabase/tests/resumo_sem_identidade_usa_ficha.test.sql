-- ============================================================
-- Resumo Bolt/Uber sem identidade fica da ficha com esse ID (pgTAP)
-- ============================================================
-- 31 fichas tinham o ID gravado e nenhuma identidade, e os resumos entravam
-- sem dono (Carolino Duarte, 2026-10-21). Ver a secção 4 da migração
-- 20261021100000.
-- ============================================================

begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000004d0000', 'Org Identidade Ficha', 'identidade-ficha-teste');

insert into public.plataformas_configuracao (id, org_id, nome, plataforma, auth_mode) values
  ('00000000-0000-0000-0000-0000004d0e01', '00000000-0000-0000-0000-0000004d0000', 'Bolt', 'bolt', 'oauth'),
  ('00000000-0000-0000-0000-0000004d0e02', '00000000-0000-0000-0000-0000004d0000', 'Uber', 'uber', 'webhook');

-- Fichas com o ID gravado sem passar pelo gatilho da ficha: o estado das
-- fichas antigas, anteriores a 01/10.
select set_config('wegest.movendo_identidade', '1', true);
insert into public.motoristas_ativos (id, org_id, nome, bolt_id, uber_uuid, status_ativo) values
  ('00000000-0000-0000-0000-0000004d0a01', '00000000-0000-0000-0000-0000004d0000', 'Carolino Teste', 'bolt-unico', 'uber-unico', true),
  ('00000000-0000-0000-0000-0000004d0a02', '00000000-0000-0000-0000-0000004d0000', 'Gémeo Um', null, 'uber-duplo', true),
  ('00000000-0000-0000-0000-0000004d0a03', '00000000-0000-0000-0000-0000004d0000', 'Gémeo Dois', null, 'uber-duplo', true),
  ('00000000-0000-0000-0000-0000004d0a04', '00000000-0000-0000-0000-0000004d0000', 'Antigo Inactivo', 'bolt-inactivo', null, false);
select set_config('wegest.movendo_identidade', '', true);

delete from public.motorista_plataforma_identidades where org_id = '00000000-0000-0000-0000-0000004d0000';

-- ── Bolt: ID numa única ficha activa ──────────────────────────────────────

select public.bolt_resumo_merge_api(
  '00000000-0000-0000-0000-0000004d0e01', '00000000-0000-0000-0000-0000004d0000', '2026-10-12', '2026-10-18',
  p_identificador_motorista => 'bolt-unico', p_motorista_nome => 'Carolino Duarte',
  p_ganhos_brutos_app => 100, p_viagens_terminadas => 5, p_api_net_earnings => 75);

select is(
  (select motorista_id from public.bolt_resumos_semanais
    where integracao_id = '00000000-0000-0000-0000-0000004d0e01' and chave_motorista = 'bolt-unico'),
  '00000000-0000-0000-0000-0000004d0a01'::uuid,
  'resumo Bolt sem identidade fica da ficha com o mesmo ID, mesmo com outro nome'
);

select is(
  (select origem from public.motorista_plataforma_identidades
    where org_id = '00000000-0000-0000-0000-0000004d0000' and plataforma = 'bolt' and identificador = 'bolt-unico'),
  'ficha',
  'a identidade nasce aí, com origem na ficha'
);

-- ── Ficha inactiva não conta ──────────────────────────────────────────────

select public.bolt_resumo_merge_api(
  '00000000-0000-0000-0000-0000004d0e01', '00000000-0000-0000-0000-0000004d0000', '2026-10-12', '2026-10-18',
  p_identificador_motorista => 'bolt-inactivo', p_motorista_nome => 'Outra Pessoa',
  p_ganhos_brutos_app => 30, p_viagens_terminadas => 1, p_api_net_earnings => 20);

select ok(
  (select motorista_id is null from public.bolt_resumos_semanais
    where integracao_id = '00000000-0000-0000-0000-0000004d0e01' and chave_motorista = 'bolt-inactivo'),
  'ID só numa ficha inactiva não liga o resumo'
);

-- ── Uber: ID numa única ficha activa ──────────────────────────────────────

insert into public.uber_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista, uber_driver_id, motorista_nome, ganhos_brutos, viagens, fonte)
values
  ('00000000-0000-0000-0000-0000004d0000', '00000000-0000-0000-0000-0000004d0e02', '2026-10-12 a 2026-10-18',
   '2026-10-12', '2026-10-18', 'uber-unico', 'uber-unico', 'CAROLINO DUARTE', 200, 10, 'csv');

select is(
  (select motorista_id from public.uber_resumos_semanais
    where integracao_id = '00000000-0000-0000-0000-0000004d0e02' and uber_driver_id = 'uber-unico'),
  '00000000-0000-0000-0000-0000004d0a01'::uuid,
  'resumo Uber sem identidade fica da ficha com o mesmo ID'
);

select is(
  (select count(*)::int from public.motorista_plataforma_identidades
    where org_id = '00000000-0000-0000-0000-0000004d0000' and plataforma = 'uber' and identificador = 'uber-unico'),
  1,
  'identidade Uber criada uma vez'
);

-- ── Uber: mesmo ID em duas fichas activas não se adivinha ────────────────
-- (na Bolt um índice único já impede o mesmo ID em duas fichas)

insert into public.uber_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista, uber_driver_id, motorista_nome, ganhos_brutos, viagens, fonte)
values
  ('00000000-0000-0000-0000-0000004d0000', '00000000-0000-0000-0000-0000004d0e02', '2026-10-12 a 2026-10-18',
   '2026-10-12', '2026-10-18', 'uber-duplo', 'uber-duplo', 'NOME QUE NAO EXISTE', 80, 4, 'csv');

select ok(
  (select motorista_id is null from public.uber_resumos_semanais
    where integracao_id = '00000000-0000-0000-0000-0000004d0e02' and uber_driver_id = 'uber-duplo'),
  'com o ID em duas fichas o resumo fica sem dono'
);

select * from finish();
rollback;
