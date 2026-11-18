-- ============================================================
-- Resumo completo da semana no app do motorista — pgTAP
-- ============================================================
-- Ver a migração 20261117170000 (coluna motorista_liquido_semanal.detalhe).
--   (1) a coluna existe e aceita a fotografia do resumo;
--   (2) semana por enviar: o motorista não lê o detalhe;
--   (3) semana enviada: o motorista lê o detalhe da sua semana;
--   (4) outro motorista não lê o detalhe alheio.
-- ============================================================

begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000003c00aa', 'a@detalhe.pt'),
  ('00000000-0000-0000-0000-0000003c00bb', 'b@detalhe.pt'),
  ('00000000-0000-0000-0000-0000003c00cc', 'gestor@detalhe.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000003c0000', 'Org Detalhe', 'detalhe');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000003c00aa', '00000000-0000-0000-0000-0000003c0000', false),
  ('00000000-0000-0000-0000-0000003c00bb', '00000000-0000-0000-0000-0000003c0000', false),
  ('00000000-0000-0000-0000-0000003c00cc', '00000000-0000-0000-0000-0000003c0000', true);
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000003c00aa', '00000000-0000-0000-0000-0000003c0000'),
  ('00000000-0000-0000-0000-0000003c00bb', '00000000-0000-0000-0000-0000003c0000'),
  ('00000000-0000-0000-0000-0000003c00cc', '00000000-0000-0000-0000-0000003c0000');

insert into public.motoristas_ativos (id, org_id, nome, user_id) values
  ('00000000-0000-0000-0000-0000003c0b01', '00000000-0000-0000-0000-0000003c0000', 'Motorista A',
   '00000000-0000-0000-0000-0000003c00aa'),
  ('00000000-0000-0000-0000-0000003c0b02', '00000000-0000-0000-0000-0000003c0000', 'Motorista B',
   '00000000-0000-0000-0000-0000003c00bb');

-- (1) o escritório grava o líquido com a fotografia do resumo
insert into public.motorista_liquido_semanal
  (org_id, motorista_id, semana_inicio, semana_fim, liquido, detalhe) values
  ('00000000-0000-0000-0000-0000003c0000', '00000000-0000-0000-0000-0000003c0b01',
   '2026-11-09', '2026-11-15', 420,
   '{"versao":1,"liquido":420,"totalReceitas":420}'::jsonb),
  ('00000000-0000-0000-0000-0000003c0000', '00000000-0000-0000-0000-0000003c0b02',
   '2026-11-09', '2026-11-15', 99,
   '{"versao":1,"liquido":99,"totalReceitas":99}'::jsonb);

select is(
  (select (detalhe->>'liquido')::int from public.motorista_liquido_semanal
    where motorista_id = '00000000-0000-0000-0000-0000003c0b01'),
  420,
  'a coluna detalhe guarda a fotografia do resumo (1)'
);

-- (2) por enviar: o motorista A não lê nada
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000003c00aa"}', true);
select is(
  (select count(*)::int from public.motorista_liquido_semanal),
  0,
  'semana por enviar: o motorista não lê o detalhe (2)'
);

-- (3) o gestor envia para a app, o motorista A passa a ler o seu detalhe
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000003c00cc"}', true);
select public.marcar_resumos_enviados(
  array['00000000-0000-0000-0000-0000003c0b01'::uuid, '00000000-0000-0000-0000-0000003c0b02'::uuid],
  '2026-11-09', 'app');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000003c00aa"}', true);
select is(
  (select (detalhe->>'liquido')::int from public.motorista_liquido_semanal),
  420,
  'semana enviada: o motorista lê o detalhe da sua semana (3)'
);

-- (4) e só o seu: nunca o do motorista B
select is(
  (select count(*)::int from public.motorista_liquido_semanal
    where motorista_id = '00000000-0000-0000-0000-0000003c0b02'),
  0,
  'o motorista não lê o detalhe de outro motorista (4)'
);

reset role;
select is(
  (select count(*)::int from public.motorista_liquido_semanal where detalhe is not null),
  2,
  'o detalhe continua gravado para o escritório (4)'
);

select * from finish();
rollback;
