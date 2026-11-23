-- ============================================================
-- O motorista só vê as contas da semana depois de enviadas — pgTAP
-- ============================================================
-- Migração 20261123120000. A semana sem linha em motorista_liquido_semanal
-- conta como POR ENVIAR (antes deixava tudo à vista).
--   (1) semana sem linha: movimentos escondidos e extrato vazio;
--   (2) antes de 09/11 continua tudo à vista;
--   (3) depois de enviada: movimentos e extrato aparecem;
--   (4) o escritório (service_role) vê sempre o extrato;
--   (5) combustível e portagens usam a mesma regra; anon não chama a função.
-- ============================================================

begin;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000005c00aa', 'motorista@contas-enviadas.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000005c0000', 'Org Contas Enviadas', 'contas-enviadas');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000005c00aa', '00000000-0000-0000-0000-0000005c0000', false);
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000005c00aa', '00000000-0000-0000-0000-0000005c0000');

insert into public.motoristas_ativos (id, org_id, nome, user_id) values
  ('00000000-0000-0000-0000-0000005c0b01', '00000000-0000-0000-0000-0000005c0000', 'Motorista',
   '00000000-0000-0000-0000-0000005c00aa');

insert into public.motorista_financeiro
  (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
  ('00000000-0000-0000-0000-0000005c0000', '00000000-0000-0000-0000-0000005c0b01',
   'debito', 'outro', 'Semana por enviar', 15, '2026-11-17', 'pendente'),
  ('00000000-0000-0000-0000-0000005c0000', '00000000-0000-0000-0000-0000005c0b01',
   'debito', 'outro', 'Antes do botao', 20, '2026-11-04', 'pendente');

-- (1) e (2) como motorista
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000005c00aa"}', true);

select is(
  (select array_agg(descricao order by descricao) from public.motorista_financeiro),
  array['Antes do botao']::text[],
  'semana sem linha conta como por enviar: o movimento dela fica escondido (1)'
);

select is(
  (select count(*)::int from public.motorista_extrato_periodo(
     '00000000-0000-0000-0000-0000005c0b01', '2026-11-16', '2026-11-22')),
  0,
  'semana por enviar: o cartão "A minha semana" não recebe valores (1)'
);

select is(
  (select count(*)::int from public.motorista_extrato_periodo(
     '00000000-0000-0000-0000-0000005c0b01', '2026-11-02', '2026-11-08')),
  1,
  'antes de 09/11 o extrato continua à vista (2)'
);

-- (3) o escritório fecha e envia a semana
reset role;
insert into public.motorista_liquido_semanal
  (org_id, motorista_id, semana_inicio, semana_fim, liquido, enviado_em, enviado_canais) values
  ('00000000-0000-0000-0000-0000005c0000', '00000000-0000-0000-0000-0000005c0b01',
   '2026-11-16', '2026-11-22', 300, now(), array['app']);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000005c00aa"}', true);

select is(
  (select count(*)::int from public.motorista_financeiro where categoria = 'outro'),
  2,
  'depois de enviada: o movimento da semana aparece (3)'
);

select is(
  (select count(*)::int from public.motorista_extrato_periodo(
     '00000000-0000-0000-0000-0000005c0b01', '2026-11-16', '2026-11-22')),
  1,
  'depois de enviada: o cartão mostra a semana (3)'
);

select is(
  (select count(*)::int from public.motorista_extrato_periodo(
     '00000000-0000-0000-0000-0000005c0b01', '2026-11-02', '2026-11-22')),
  0,
  'intervalo de várias semanas não esconde a de 09/11 por enviar (3)'
);

-- (4) o escritório vê a semana corrente mesmo por enviar
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select count(*)::int from public.motorista_extrato_periodo(
     '00000000-0000-0000-0000-0000005c0b01', '2026-11-23', '2026-11-29')),
  1,
  'service_role vê o extrato de uma semana por enviar (4)'
);

-- (5)
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and policyname in ('combustivel_motorista_ve_o_seu', 'portagens_motorista_ve_as_suas')
      and qual like '%contas_semana_enviadas%'),
  4,
  'combustível (BP, Repsol, EDP) e portagens só mostram semanas enviadas (5)'
);

select ok(
  not has_function_privilege('anon', 'public.contas_semana_enviadas(uuid, date)', 'execute'),
  'anon não chama contas_semana_enviadas (5)'
);

select ok(
  has_function_privilege('authenticated', 'public.contas_semana_enviadas(uuid, date)', 'execute'),
  'authenticated executa contas_semana_enviadas, senão as políticas falham (5)'
);

select * from finish();
rollback;
