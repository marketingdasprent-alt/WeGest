-- ============================================================
-- O líquido positivo nasce pago; a Bolt da ficha para quem a pode ver — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- 03/11/2026: o movimento 'resumos' ficava pendente até alguém marcar "Pago" no
-- Relatório de Pagamento e o pendente acumulava (2 mil, 4 mil no portal).
-- Ver as migrações 20261103100000 e 20261103110000.
--   (1) líquido positivo: visto no relatório e movimento pago;
--   (2) líquido negativo (dívida): continua pendente, sem visto;
--   (3) semana gravada a 0 e corrigida depois: fica paga;
--   (4) já marcada à mão: não rebenta nem duplica o visto;
--   (5) a Bolt da ficha: quem vê a ficha lê, sem permissão recusa, service_role
--       soma, anon não chama.
-- ============================================================

begin;
select plan(10);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000003a0000', 'Org Paga Sozinho', 'paga-sozinho');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000003a0b01', '00000000-0000-0000-0000-0000003a0000', 'Credito'),
  ('00000000-0000-0000-0000-0000003a0b02', '00000000-0000-0000-0000-0000003a0000', 'Divida'),
  ('00000000-0000-0000-0000-0000003a0b03', '00000000-0000-0000-0000-0000003a0000', 'Corrigido'),
  ('00000000-0000-0000-0000-0000003a0b04', '00000000-0000-0000-0000-0000003a0000', 'Ja marcado');

-- (4) visto à mão antes de o líquido existir.
insert into public.relatorio_pagamento_pagos (org_id, motorista_id, semana_inicio) values
  ('00000000-0000-0000-0000-0000003a0000', '00000000-0000-0000-0000-0000003a0b04', '2026-10-26');

insert into public.motorista_liquido_semanal (org_id, motorista_id, semana_inicio, semana_fim, liquido) values
  ('00000000-0000-0000-0000-0000003a0000', '00000000-0000-0000-0000-0000003a0b01', '2026-10-26', '2026-11-01', 350.40),
  ('00000000-0000-0000-0000-0000003a0000', '00000000-0000-0000-0000-0000003a0b02', '2026-10-26', '2026-11-01', -80),
  ('00000000-0000-0000-0000-0000003a0000', '00000000-0000-0000-0000-0000003a0b03', '2026-10-26', '2026-11-01', 0);

select ok(
  exists (select 1 from public.relatorio_pagamento_pagos
           where motorista_id = '00000000-0000-0000-0000-0000003a0b01' and semana_inicio = '2026-10-26'),
  'líquido positivo: a semana fica marcada no Relatório de Pagamento'
);

select is(
  (select f.status || ' ' || (f.data_pagamento is not null)::text
     from public.motorista_financeiro f
     join public.motorista_liquido_semanal l on l.id = f.liquido_semanal_id
    where l.motorista_id = '00000000-0000-0000-0000-0000003a0b01' and l.semana_inicio = '2026-10-26'),
  'pago true',
  'líquido positivo: o movimento nasce pago, com data de pagamento'
);

select is(
  (select f.status
     from public.motorista_financeiro f
     join public.motorista_liquido_semanal l on l.id = f.liquido_semanal_id
    where l.motorista_id = '00000000-0000-0000-0000-0000003a0b02' and l.semana_inicio = '2026-10-26'),
  'pendente',
  'dívida do motorista: continua pendente'
);

select ok(
  not exists (select 1 from public.relatorio_pagamento_pagos
               where motorista_id = '00000000-0000-0000-0000-0000003a0b02'),
  'dívida do motorista: sem visto no relatório'
);

update public.motorista_liquido_semanal set liquido = 120
 where motorista_id = '00000000-0000-0000-0000-0000003a0b03' and semana_inicio = '2026-10-26';

select is(
  (select f.status
     from public.motorista_financeiro f
     join public.motorista_liquido_semanal l on l.id = f.liquido_semanal_id
    where l.motorista_id = '00000000-0000-0000-0000-0000003a0b03' and l.semana_inicio = '2026-10-26'),
  'pago',
  'semana gravada a 0 e corrigida para positivo: fica paga'
);

select is(
  (select count(*)::int from public.relatorio_pagamento_pagos
    where motorista_id = '00000000-0000-0000-0000-0000003a0b04'),
  1,
  'já marcada à mão: o visto não duplica nem rebenta'
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
  ('00000000-0000-0000-0000-0000003a00bb', 'gestor@paga-sozinho.pt');
insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000003a00bb', '00000000-0000-0000-0000-0000003a0000', true);
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000003a00bb', '00000000-0000-0000-0000-0000003a0000');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000003a00bb"}', true);
select is(
  public.motorista_bolt_liquido_semana('00000000-0000-0000-0000-0000003a0b01', '2026-10-26', '2026-11-01'),
  503.37::numeric,
  'admin da organização lê a Bolt da ficha'
);

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000003a00aa"}', true);
select throws_ok(
  $$ select public.motorista_bolt_liquido_semana('00000000-0000-0000-0000-0000003a0b01', '2026-10-26', '2026-11-01') $$,
  '42501',
  'sem permissao para ver a Bolt deste motorista',
  'utilizador sem acesso à ficha não lê a Bolt'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.motorista_bolt_liquido_semana('00000000-0000-0000-0000-0000003a0b01', '2026-10-26', '2026-11-01'),
  503.37::numeric,
  'service_role: soma a Bolt da semana'
);

select ok(
  not has_function_privilege('anon', 'public.motorista_bolt_liquido_semana(uuid, date, date)', 'execute'),
  'anon não chama motorista_bolt_liquido_semana'
);

select * from finish();
rollback;
