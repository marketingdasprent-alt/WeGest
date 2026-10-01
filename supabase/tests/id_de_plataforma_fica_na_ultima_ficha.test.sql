-- ============================================================
-- Um ID Uber ou Bolt fica com a ficha que o recebeu por último — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Reproduz o André Nascimento (2026-10-01): a ficha antiga, inactiva, tinha o
-- ID Bolt e a conta Uber; voltou com ficha nova e o Bolt continuava a cair na
-- antiga. Ver a migração 20261001170000.
--   (1) a ficha nova com a mesma conta Uber leva também o Bolt da antiga
--       (mesma pessoa), e o que já foi importado passa para ela;
--   (2) entre duas fichas activas, fica com o ID a última que o recebeu;
--   (3) mudar o dono de uma linha antiga não é recusado pela validação dos
--       ganhos Bolt;
--   (4) só o service_role chama mover_identidade_plataforma.
-- ============================================================

begin;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000001e00ff', 'bootstrap@ultima-ficha.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000001e0000', 'Org Ultima Ficha', 'uf-a');

insert into public.plataformas_configuracao (id, org_id, nome, plataforma, csv_sem_metricas_atividade) values
  ('00000000-0000-0000-0000-0000001e0e01', '00000000-0000-0000-0000-0000001e0000', 'Bolt', 'bolt', true);

-- Ficha antiga, activa, com as duas contas.
insert into public.motoristas_ativos (id, org_id, nome, bolt_id, uber_uuid) values
  ('00000000-0000-0000-0000-0000001e0b01', '00000000-0000-0000-0000-0000001e0000',
   'André Nascimento', 'bolt-andre', 'uber-andre');

-- Semana importada quando a antiga era a dona. Ganhos sem actividade, aceite
-- porque a integração não traz métricas (para testar o caso 3 mais abaixo).
insert into public.bolt_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista,
   identificador_motorista, motorista_nome, ganhos_liquidos)
values
  ('00000000-0000-0000-0000-0000001e0000', '00000000-0000-0000-0000-0000001e0e01',
   '2026-09-21 a 2026-09-27', '2026-09-21', '2026-09-27', 'bolt-andre',
   'bolt-andre', 'André Nascimento', 105.09);

select is(
  (select motorista_id from public.bolt_resumos_semanais where identificador_motorista = 'bolt-andre'),
  '00000000-0000-0000-0000-0000001e0b01'::uuid,
  'antes: o Bolt vai para a ficha antiga'
);

-- A antiga é desactivada; a integração passa a exigir métricas.
update public.motoristas_ativos set status_ativo = false
 where id = '00000000-0000-0000-0000-0000001e0b01';
update public.plataformas_configuracao set csv_sem_metricas_atividade = false
 where id = '00000000-0000-0000-0000-0000001e0e01';

-- (1) Volta com ficha nova e a mesma conta Uber.
insert into public.motoristas_ativos (id, org_id, nome, uber_uuid) values
  ('00000000-0000-0000-0000-0000001e0b02', '00000000-0000-0000-0000-0000001e0000',
   'André Gonçalves de Jesus Nascimento', 'uber-andre');

select is(
  (select motorista_id from public.motorista_plataforma_identidades
    where org_id = '00000000-0000-0000-0000-0000001e0000' and plataforma = 'uber' and identificador = 'uber-andre'),
  '00000000-0000-0000-0000-0000001e0b02'::uuid,
  'a conta Uber passa para a ficha nova'
);

select is(
  (select motorista_id from public.motorista_plataforma_identidades
    where org_id = '00000000-0000-0000-0000-0000001e0000' and plataforma = 'bolt' and identificador = 'bolt-andre'),
  '00000000-0000-0000-0000-0000001e0b02'::uuid,
  'a conta Bolt da ficha antiga vem junto (mesma pessoa)'
);

select is(
  (select bolt_id from public.motoristas_ativos where id = '00000000-0000-0000-0000-0000001e0b02'),
  'bolt-andre',
  'a ficha nova mostra o ID Bolt'
);

select ok(
  (select bolt_id is null and uber_uuid is null from public.motoristas_ativos
    where id = '00000000-0000-0000-0000-0000001e0b01'),
  'a ficha antiga fica sem os IDs'
);

-- (3) A linha antiga mudou de dono sem ser recusada pela validação.
select is(
  (select motorista_id from public.bolt_resumos_semanais where identificador_motorista = 'bolt-andre'),
  '00000000-0000-0000-0000-0000001e0b02'::uuid,
  'o Bolt já importado passa para a ficha nova'
);

-- (2) Duas fichas activas: fica com o ID a última que o recebeu.
insert into public.motoristas_ativos (id, org_id, nome, bolt_id) values
  ('00000000-0000-0000-0000-0000001e0b03', '00000000-0000-0000-0000-0000001e0000', 'Primeira', 'bolt-y');
insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000001e0b04', '00000000-0000-0000-0000-0000001e0000', 'Segunda');

select lives_ok(
  $$update public.motoristas_ativos set bolt_id = 'bolt-y'
     where id = '00000000-0000-0000-0000-0000001e0b04'$$,
  'dar a uma ficha activa um ID que outra tem já não é recusado pelo índice'
);

select is(
  (select motorista_id from public.motorista_plataforma_identidades
    where org_id = '00000000-0000-0000-0000-0000001e0000' and plataforma = 'bolt' and identificador = 'bolt-y'),
  '00000000-0000-0000-0000-0000001e0b04'::uuid,
  'o ID fica com a última que o recebeu'
);

select is(
  (select bolt_id from public.motoristas_ativos where id = '00000000-0000-0000-0000-0000001e0b03'),
  null,
  'a primeira fica sem o ID'
);

-- A primeira estava activa: não é a mesma pessoa, não perde mais nada.
select is(
  (select count(*)::int from public.motorista_plataforma_identidades
    where motorista_id = '00000000-0000-0000-0000-0000001e0b03'),
  0,
  'só o ID disputado mudou de dono'
);

-- (4)
select ok(
  not has_function_privilege('authenticated', 'public.mover_identidade_plataforma(uuid, text, text, uuid, boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mover_identidade_plataforma(uuid, text, text, uuid, boolean)', 'EXECUTE'),
  'mover_identidade_plataforma: só o service_role'
);

select * from finish();
rollback;
