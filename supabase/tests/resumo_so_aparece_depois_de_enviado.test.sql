-- ============================================================
-- O motorista só vê o resumo depois de enviado — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
-- Ver a migração 20261109120000.
--   (1) semana por enviar: o motorista não vê o líquido nem o movimento;
--   (2) movimentos sem resumo continuam à vista;
--   (3) marcar como enviado (app): passa a ver os dois;
--   (4) reenviar por outro canal junta o canal sem mudar a data;
--   (5) canal inválido é recusado; anon não chama a função.
-- ============================================================

begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000003b00aa', 'motorista@enviado.pt'),
  ('00000000-0000-0000-0000-0000003b00bb', 'gestor@enviado.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000003b0000', 'Org Enviado', 'enviado');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000003b00aa', '00000000-0000-0000-0000-0000003b0000', false),
  ('00000000-0000-0000-0000-0000003b00bb', '00000000-0000-0000-0000-0000003b0000', true);
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000003b00aa', '00000000-0000-0000-0000-0000003b0000'),
  ('00000000-0000-0000-0000-0000003b00bb', '00000000-0000-0000-0000-0000003b0000');

insert into public.motoristas_ativos (id, org_id, nome, user_id) values
  ('00000000-0000-0000-0000-0000003b0b01', '00000000-0000-0000-0000-0000003b0000', 'Motorista',
   '00000000-0000-0000-0000-0000003b00aa');

insert into public.motorista_liquido_semanal (org_id, motorista_id, semana_inicio, semana_fim, liquido) values
  ('00000000-0000-0000-0000-0000003b0000', '00000000-0000-0000-0000-0000003b0b01', '2026-11-09', '2026-11-15', 420);

insert into public.motorista_financeiro
  (org_id, motorista_id, tipo, categoria, descricao, valor, data_movimento, status) values
  ('00000000-0000-0000-0000-0000003b0000', '00000000-0000-0000-0000-0000003b0b01',
   'debito', 'outro', 'Multa', 15, '2026-11-10', 'pendente');

-- (1) e (2) como motorista
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000003b00aa"}', true);

select is(
  (select count(*)::int from public.motorista_liquido_semanal),
  0,
  'semana por enviar: o motorista não vê o líquido (1)'
);

select is(
  (select count(*)::int from public.motorista_financeiro where categoria = 'resumos'),
  0,
  'semana por enviar: o motorista não vê o movimento do resumo (1)'
);

select is(
  (select count(*)::int from public.motorista_financeiro where categoria = 'outro'),
  1,
  'movimentos sem resumo continuam à vista (2)'
);

-- (3) gestor envia para a app
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000003b00bb"}', true);
select is(
  public.marcar_resumos_enviados(array['00000000-0000-0000-0000-0000003b0b01'::uuid], '2026-11-09', 'app'),
  1,
  'o gestor marca a semana como enviada (3)'
);

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000003b00aa"}', true);
select is(
  (select count(*)::int from public.motorista_liquido_semanal)
    + (select count(*)::int from public.motorista_financeiro where categoria = 'resumos'),
  2,
  'depois de enviada: o motorista vê o líquido e o movimento (3)'
);

-- (4) reenviar por WhatsApp
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000003b00bb"}', true);
select public.marcar_resumos_enviados(array['00000000-0000-0000-0000-0000003b0b01'::uuid], '2026-11-09', 'whatsapp');
select is(
  (select enviado_canais from public.motorista_liquido_semanal
    where motorista_id = '00000000-0000-0000-0000-0000003b0b01'),
  array['app', 'whatsapp']::text[],
  'reenviar junta o canal (4)'
);

-- (5)
select throws_ok(
  $$ select public.marcar_resumos_enviados(array['00000000-0000-0000-0000-0000003b0b01'::uuid], '2026-11-09', 'sms') $$,
  '22023',
  null,
  'canal inválido é recusado (5)'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.marcar_resumos_enviados(uuid[], date, text)', 'execute'),
  'anon não chama marcar_resumos_enviados (5)'
);

select * from finish();
rollback;
