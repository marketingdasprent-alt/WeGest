-- ============================================================
-- Um ID Uber ou Bolt fica com a ficha que o recebeu por último — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Reproduz o André Nascimento (2026-10-01): a ficha antiga, inactiva, tinha o
-- ID Bolt e a conta Uber; voltou com ficha nova e o Bolt continuava a cair na
-- antiga. Ver a migração 20261001170000. As datas são relativas a hoje, para
-- o teste não depender do dia em que corre.
--   (1) a ficha nova com a mesma conta Uber leva também o Bolt da antiga
--       (mesma pessoa);
--   (2) a semana actual passa para a ficha nova; uma semana antiga fica onde
--       estava (as semanas que já passaram não mudam);
--   (3) o fecho por pagar da ficha antiga na semana actual sai (senão pagava-se
--       a dobrar); o de uma semana antiga fica;
--   (4) entre duas fichas activas, fica com o ID a última que o recebeu;
--   (5) mudar o dono de uma linha não é recusado pela validação dos ganhos;
--   (6) só o service_role chama mover_identidade_plataforma.
-- ============================================================

begin;
select plan(13);

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

-- Bolt da semana actual e de uma semana de há cinco semanas, importado quando a
-- antiga era a dona. Ganhos sem actividade, aceites porque a integração não
-- traz métricas (serve o caso 5).
insert into public.bolt_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista,
   identificador_motorista, motorista_nome, ganhos_liquidos)
select '00000000-0000-0000-0000-0000001e0000', '00000000-0000-0000-0000-0000001e0e01',
       to_char(s.ini, 'YYYY-MM-DD') || ' a ' || to_char(s.ini + 6, 'YYYY-MM-DD'),
       s.ini, s.ini + 6, 'bolt-andre', 'bolt-andre', 'André Nascimento', s.valor
  from (values (date_trunc('week', current_date)::date, 105.09),
               (date_trunc('week', current_date)::date - 35, 71.38)) as s(ini, valor);

-- Fechos da ficha antiga: semana actual e semana antiga, ambos por pagar.
insert into public.motorista_liquido_semanal (org_id, motorista_id, semana_inicio, semana_fim, liquido)
select '00000000-0000-0000-0000-0000001e0000', '00000000-0000-0000-0000-0000001e0b01', s.ini, s.ini + 6, s.liquido
  from (values (date_trunc('week', current_date)::date, 99.20),
               (date_trunc('week', current_date)::date - 35, 69.07)) as s(ini, liquido);

select is(
  (select count(*)::int from public.bolt_resumos_semanais
    where identificador_motorista = 'bolt-andre' and motorista_id = '00000000-0000-0000-0000-0000001e0b01'),
  2,
  'antes: o Bolt das duas semanas vai para a ficha antiga'
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

select ok(
  (select bolt_id = 'bolt-andre' from public.motoristas_ativos where id = '00000000-0000-0000-0000-0000001e0b02')
  and (select bolt_id is null and uber_uuid is null from public.motoristas_ativos
        where id = '00000000-0000-0000-0000-0000001e0b01'),
  'os IDs saem da ficha antiga e ficam na nova'
);

-- (2) e (5)
select is(
  (select motorista_id from public.bolt_resumos_semanais
    where identificador_motorista = 'bolt-andre' and periodo_inicio = date_trunc('week', current_date)::date),
  '00000000-0000-0000-0000-0000001e0b02'::uuid,
  'o Bolt da semana actual passa para a ficha nova (sem ser recusado pela validação)'
);

select is(
  (select motorista_id from public.bolt_resumos_semanais
    where identificador_motorista = 'bolt-andre' and periodo_inicio = date_trunc('week', current_date)::date - 35),
  '00000000-0000-0000-0000-0000001e0b01'::uuid,
  'o Bolt de uma semana que já passou fica na ficha antiga'
);

-- (3)
select is(
  (select count(*)::int from public.motorista_liquido_semanal
    where motorista_id = '00000000-0000-0000-0000-0000001e0b01'
      and semana_inicio = date_trunc('week', current_date)::date),
  0,
  'o fecho por pagar da ficha antiga na semana actual sai (não se paga a dobrar)'
);

select is(
  (select count(*)::int from public.motorista_liquido_semanal
    where motorista_id = '00000000-0000-0000-0000-0000001e0b01'
      and semana_inicio = date_trunc('week', current_date)::date - 35),
  1,
  'o fecho de uma semana que já passou fica'
);

-- (4) Duas fichas activas: fica com o ID a última que o recebeu.
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

-- (6)
select ok(
  not has_function_privilege('authenticated', 'public.mover_identidade_plataforma(uuid, text, text, uuid, boolean, date)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mover_identidade_plataforma(uuid, text, text, uuid, boolean, date)', 'EXECUTE'),
  'mover_identidade_plataforma: só o service_role'
);

select * from finish();
rollback;
