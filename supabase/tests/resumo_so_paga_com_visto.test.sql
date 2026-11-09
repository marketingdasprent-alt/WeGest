-- ============================================================
-- O resumo só fica pago com visto; a Bolt da ficha para quem a pode ver — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- 09/11/2026: o pagamento ao gravar o resumo (20261103110000) marcava pagas
-- semanas da Premium Ride que ninguém tinha pago. Passa a valer só o visto no
-- Relatório de Pagamento. Ver a migração 20261109100000.
--   (1) líquido positivo: nasce pendente e sem visto;
--   (2) marcar o visto: o movimento passa a pago, com data;
--   (3) líquido negativo (dívida): continua pendente;
--   (4) visto marcado antes de o líquido existir: o movimento nasce pago;
--   (5) a Bolt da ficha: quem vê a ficha lê, sem permissão recusa, service_role
--       soma, anon não chama.
-- ============================================================

begin;
select plan(9);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000003a0000', 'Org Paga Com Visto', 'paga-com-visto');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000003a0b01', '00000000-0000-0000-0000-0000003a0000', 'Credito'),
  ('00000000-0000-0000-0000-0000003a0b02', '00000000-0000-0000-0000-0000003a0000', 'Divida'),
  ('00000000-0000-0000-0000-0000003a0b04', '00000000-0000-0000-0000-0000003a0000', 'Ja marcado');

-- (4) visto à mão antes de o líquido existir.
insert into public.relatorio_pagamento_pagos (org_id, motorista_id, semana_inicio) values
  ('00000000-0000-0000-0000-0000003a0000', '00000000-0000-0000-0000-0000003a0b04', '2026-10-26');

insert into public.motorista_liquido_semanal (org_id, motorista_id, semana_inicio, semana_fim, liquido) values
  ('00000000-0000-0000-0000-0000003a0000', '00000000-0000-0000-0000-0000003a0b01', '2026-10-26', '2026-11-01', 350.40),
  ('00000000-0000-0000-0000-0000003a0000', '00000000-0000-0000-0000-0000003a0b02', '2026-10-26', '2026-11-01', -80),
  ('00000000-0000-0000-0000-0000003a0000', '00000000-0000-0000-0000-0000003a0b04', '2026-10-26', '2026-11-01', 210);

select ok(
  not exists (select 1 from public.relatorio_pagamento_pagos
               where motorista_id = '00000000-0000-0000-0000-0000003a0b01'),
  'líquido positivo: gravar o resumo não marca o visto (1)'
);

select is(
  (select f.status
     from public.motorista_financeiro f
     join public.motorista_liquido_semanal l on l.id = f.liquido_semanal_id
    where l.motorista_id = '00000000-0000-0000-0000-0000003a0b01' and l.semana_inicio = '2026-10-26'),
  'pendente',
  'líquido positivo: o movimento nasce pendente (1)'
);

insert into public.relatorio_pagamento_pagos (org_id, motorista_id, semana_inicio) values
  ('00000000-0000-0000-0000-0000003a0000', '00000000-0000-0000-0000-0000003a0b01', '2026-10-26');

select is(
  (select f.status || ' ' || (f.data_pagamento is not null)::text
     from public.motorista_financeiro f
     join public.motorista_liquido_semanal l on l.id = f.liquido_semanal_id
    where l.motorista_id = '00000000-0000-0000-0000-0000003a0b01' and l.semana_inicio = '2026-10-26'),
  'pago true',
  'marcar o visto: o movimento passa a pago, com data (2)'
);

select is(
  (select f.status
     from public.motorista_financeiro f
     join public.motorista_liquido_semanal l on l.id = f.liquido_semanal_id
    where l.motorista_id = '00000000-0000-0000-0000-0000003a0b02' and l.semana_inicio = '2026-10-26'),
  'pendente',
  'dívida do motorista: continua pendente (3)'
);

select is(
  (select f.status
     from public.motorista_financeiro f
     join public.motorista_liquido_semanal l on l.id = f.liquido_semanal_id
    where l.motorista_id = '00000000-0000-0000-0000-0000003a0b04' and l.semana_inicio = '2026-10-26'),
  'pago',
  'visto marcado antes de o líquido existir: o movimento nasce pago (4)'
);

-- (5) Bolt da ficha
insert into public.plataformas_configuracao (id, org_id, nome, plataforma, csv_sem_metricas_atividade) values
  ('00000000-0000-0000-0000-0000003a0e01', '00000000-0000-0000-0000-0000003a0000', 'Bolt', 'bolt', true);
insert into public.bolt_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista,
   identificador_motorista, motorista_nome, motorista_id, ganhos_liquidos)
values ('00000000-0000-0000-0000-0000003a0000', '00000000-0000-0000-0000-0000003a0e01',
        '2026-10-26 a 2026-11-01', '2026-10-26', '2026-11-01',
        'bolt-x', 'bolt-x', 'Credito', '00000000-0000-0000-0000-0000003a0b01', 503.37);

-- Quem pode ver a ficha lê a Bolt (o caso que falhou em produção: a função
-- conferia a tabela errada e recusava toda a gente, admin incluído).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000003a00bb', 'gestor@paga-com-visto.pt');
insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000003a00bb', '00000000-0000-0000-0000-0000003a0000', true);
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000003a00bb', '00000000-0000-0000-0000-0000003a0000');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000003a00bb"}', true);
select is(
  public.motorista_bolt_liquido_semana('00000000-0000-0000-0000-0000003a0b01', '2026-10-26', '2026-11-01'),
  503.37::numeric,
  'admin da organização lê a Bolt da ficha (5)'
);

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000003a00aa"}', true);
select throws_ok(
  $$ select public.motorista_bolt_liquido_semana('00000000-0000-0000-0000-0000003a0b01', '2026-10-26', '2026-11-01') $$,
  '42501',
  'sem permissao para ver a Bolt deste motorista',
  'utilizador sem acesso à ficha não lê a Bolt (5)'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.motorista_bolt_liquido_semana('00000000-0000-0000-0000-0000003a0b01', '2026-10-26', '2026-11-01'),
  503.37::numeric,
  'service_role: soma a Bolt da semana (5)'
);

select ok(
  not has_function_privilege('anon', 'public.motorista_bolt_liquido_semana(uuid, date, date)', 'execute'),
  'anon não chama motorista_bolt_liquido_semana (5)'
);

select * from finish();
rollback;
