-- ============================================================
-- Preço semanal negociado num TVDE (20261019100000)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- O aceite do pedido 'preco_semana' tem de:
--   * abrir uma versão nova na segunda-feira desta semana, com o preço novo
--     (condutor e valor do contrato, que são o mesmo número), deixando a versão antiga com o preço antigo — o
--     resumo recalcula semanas fechadas a partir do contrato;
--   * mudar no próprio sítio um contrato que já começou nesta semana;
--   * aplicar-se à versão em vigor quando o pedido foi feito numa anterior;
--   * recusar fora de TVDE e quem não é supervisor, sem deixar rasto.
-- Tudo relativo a now(): nada depende do dia da semana.
-- ============================================================

begin;
select plan(17);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação".
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d1fff', 'bootstrap@preco-neg.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000d1000', 'Org Preco Negociado', 'preco-neg');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d1a01', 'supervisor@preco-neg.pt'),
  ('00000000-0000-0000-0000-0000000d1a02', 'gestor@preco-neg.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000d1a01', '00000000-0000-0000-0000-0000000d1000', true),
  ('00000000-0000-0000-0000-0000000d1a02', '00000000-0000-0000-0000-0000000d1000', false);

delete from public.user_org_ativa where user_id in
  ('00000000-0000-0000-0000-0000000d1a01', '00000000-0000-0000-0000-0000000d1a02');
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000d1a01', '00000000-0000-0000-0000-0000000d1000'),
  ('00000000-0000-0000-0000-0000000d1a02', '00000000-0000-0000-0000-0000000d1000');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000d1c01', '00000000-0000-0000-0000-0000000d1000', 'Cliente Preco');

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-0000000d1e01', '00000000-0000-0000-0000-0000000d1000', 'PN-01-AA', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000d1e02', '00000000-0000-0000-0000-0000000d1000', 'PN-02-AA', 'Toyota', 'Corolla'),
  ('00000000-0000-0000-0000-0000000d1e03', '00000000-0000-0000-0000-0000000d1000', 'PN-03-AA', 'Toyota', 'Corolla');

-- reserva_id é NOT NULL. 'concluida': já virou contrato.
insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado) values
  ('00000000-0000-0000-0000-0000000d1401', '00000000-0000-0000-0000-0000000d1000', 980001,
   now() - interval '40 days', '00000000-0000-0000-0000-0000000d1e01', '00000000-0000-0000-0000-0000000d1c01', 'concluida'),
  ('00000000-0000-0000-0000-0000000d1402', '00000000-0000-0000-0000-0000000d1000', 980002,
   now(), '00000000-0000-0000-0000-0000000d1e02', '00000000-0000-0000-0000-0000000d1c01', 'concluida'),
  ('00000000-0000-0000-0000-0000000d1403', '00000000-0000-0000-0000-0000000d1000', 980003,
   now() - interval '10 days', '00000000-0000-0000-0000-0000000d1e03', '00000000-0000-0000-0000-0000000d1c01', 'concluida');

create temp table semana on commit drop as
  select date_trunc('week', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon' as desde;

insert into public.contratos_renting
  (id, org_id, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, valor_total_manual, created_by)
values
  -- C1: TVDE em curso há 40 dias — o aceite abre versão nova.
  ('00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1000',
   '00000000-0000-0000-0000-0000000d1401', '00000000-0000-0000-0000-0000000d1c01',
   '00000000-0000-0000-0000-0000000d1e01', 'PN-01-AA', now() - interval '40 days', null,
   'em_curso', 'pendente', 'tvde', 23, 200, '00000000-0000-0000-0000-0000000d1a01'),
  -- C2: TVDE que começou nesta semana — muda no próprio sítio.
  ('00000000-0000-0000-0000-0000000d1002', '00000000-0000-0000-0000-0000000d1000',
   '00000000-0000-0000-0000-0000000d1402', '00000000-0000-0000-0000-0000000d1c01',
   '00000000-0000-0000-0000-0000000d1e02', 'PN-02-AA', (select desde from semana) + interval '1 minute', null,
   'em_curso', 'pendente', 'tvde', 23, 200, '00000000-0000-0000-0000-0000000d1a01'),
  -- C3: rent-a-car — não se negoceia preço semanal.
  ('00000000-0000-0000-0000-0000000d1003', '00000000-0000-0000-0000-0000000d1000',
   '00000000-0000-0000-0000-0000000d1403', '00000000-0000-0000-0000-0000000d1c01',
   '00000000-0000-0000-0000-0000000d1e03', 'PN-03-AA', now() - interval '10 days', now() + interval '20 days',
   'em_curso', 'pendente', 'rent_a_car', 23, 900, '00000000-0000-0000-0000-0000000d1a01');

insert into public.contrato_condutores (org_id, contrato_id, cliente_id, is_principal) values
  ('00000000-0000-0000-0000-0000000d1000', '00000000-0000-0000-0000-0000000d1001',
   '00000000-0000-0000-0000-0000000d1c01', true);

insert into public.pedidos_alteracao_contrato
  (id, org_id, contrato_id, tipo, valor_atual, valor_pedido, motivo, created_by)
values
  ('00000000-0000-0000-0000-0000000d1b01', '00000000-0000-0000-0000-0000000d1000',
   '00000000-0000-0000-0000-0000000d1001', 'preco_semana', 200, 180, 'Negociado', '00000000-0000-0000-0000-0000000d1a02'),
  ('00000000-0000-0000-0000-0000000d1b02', '00000000-0000-0000-0000-0000000d1000',
   '00000000-0000-0000-0000-0000000d1002', 'preco_semana', 200, 150, 'Negociado', '00000000-0000-0000-0000-0000000d1a02'),
  ('00000000-0000-0000-0000-0000000d1b03', '00000000-0000-0000-0000-0000000d1000',
   '00000000-0000-0000-0000-0000000d1003', 'preco_semana', 30, 25, 'Negociado', '00000000-0000-0000-0000-0000000d1a02');

-- ── Estrutura ──────────────────────────────────────────────

select has_column('public', 'contratos_renting', 'preco_semana_acordado',
  'o contrato guarda o preço semanal negociado');

select ok(not has_function_privilege('authenticated',
  'public.fn_aplicar_preco_semana_negociado(uuid, numeric, uuid)', 'EXECUTE'),
  'só a resposta ao pedido aplica o preço — o browser não o chama directamente');

-- ── Quem não é supervisor não responde ─────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1a02', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d1a02","role":"authenticated"}', true);

select throws_ok(
  $$ select public.responder_pedido_troca_kms('00000000-0000-0000-0000-0000000d1b01', true) $$,
  'P0001', 'Só o Supervisor Gestor TVDE pode responder a este pedido.',
  'o gestor que pediu não aprova o próprio pedido'
);

-- ── Supervisor (admin) aceita ──────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d1a01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d1a01","role":"authenticated"}', true);

select lives_ok(
  $$ select public.responder_pedido_troca_kms('00000000-0000-0000-0000-0000000d1b01', true) $$,
  'aceitar o preço de um TVDE em curso há semanas'
);

create temp table v1 on commit drop as
  select * from public.contratos_renting
   where contrato_anterior_id = '00000000-0000-0000-0000-0000000d1001';

select ok(
  (select o.substituido_em is not null and o.estado_operacional = 'fechado'
          and o.data_fim = (select desde from semana)
          and o.preco_semana_acordado is null and o.valor_total_manual = 200
     from public.contratos_renting o where o.id = '00000000-0000-0000-0000-0000000d1001'),
  'a versão antiga fecha na segunda-feira desta semana e fica com o preço antigo'
);

select ok(
  (select count(*) = 1 and bool_and(
            n.data_inicio = (select desde from semana) and n.data_fim is null
            and n.estado_operacional = 'em_curso' and n.estado_financeiro = 'pendente'
            and n.preco_semana_acordado = 180 and n.valor_total_manual = 180
            and n.versao = 2 and n.substituido_em is null)
     from v1 n),
  'a versão nova começa na segunda-feira, em curso, com o preço negociado no condutor e no contrato'
);

select is(
  (select codigo from v1),
  (select codigo from public.contratos_renting where id = '00000000-0000-0000-0000-0000000d1001'),
  'o código do contrato mantém-se'
);

select is(
  (select count(*)::int from public.contrato_condutores where contrato_id = (select id from v1)),
  1,
  'os condutores passam para a versão nova'
);

select is(
  (select count(*)::int from public.calendario_eventos
    where origem_tipo = 'contrato_renting' and origem_id = (select id from v1)
      and tipo in ('entrega', 'recolha') and realizado_em is null),
  0,
  'sem entrega no calendário: a viatura não saiu do motorista'
);

select is(
  (select estado from public.pedidos_alteracao_contrato where id = '00000000-0000-0000-0000-0000000d1b01'),
  'aceite',
  'o pedido fica aceite'
);

select throws_ok(
  $$ update public.contratos_renting set preco_semana_acordado = 1
      where id = '00000000-0000-0000-0000-0000000d1001' $$,
  '23000', null,
  'o preço da versão substituída é imutável'
);

-- ── Contrato que começou nesta semana: no próprio sítio ────

select lives_ok(
  $$ select public.responder_pedido_troca_kms('00000000-0000-0000-0000-0000000d1b02', true) $$,
  'aceitar o preço de um TVDE desta semana'
);

select ok(
  (select c.preco_semana_acordado = 150 and c.valor_total_manual = 150 and c.substituido_em is null
          and not exists (select 1 from public.contratos_renting x
                           where x.contrato_anterior_id = c.id)
     from public.contratos_renting c where c.id = '00000000-0000-0000-0000-0000000d1002'),
  'começou nesta semana: muda no próprio contrato, sem versão nova'
);

-- ── Pedido feito numa versão que entretanto foi substituída ─

insert into public.pedidos_alteracao_contrato
  (id, org_id, contrato_id, tipo, valor_atual, valor_pedido, motivo, created_by)
values
  ('00000000-0000-0000-0000-0000000d1b04', '00000000-0000-0000-0000-0000000d1000',
   '00000000-0000-0000-0000-0000000d1001', 'preco_semana', 180, 170, 'Outra vez',
   '00000000-0000-0000-0000-0000000d1a02');

select lives_ok(
  $$ select public.responder_pedido_troca_kms('00000000-0000-0000-0000-0000000d1b04', true) $$,
  'aceitar um pedido feito na versão que já fechou'
);

select is(
  (select preco_semana_acordado from public.contratos_renting where id = (select id from v1)),
  170::numeric(12, 2),
  'o preço vai para a versão em vigor, não para a que fechou'
);

-- ── Fora de TVDE: recusado, sem rasto ──────────────────────

select throws_ok(
  $$ select public.responder_pedido_troca_kms('00000000-0000-0000-0000-0000000d1b03', true) $$,
  'P0001', 'O preço semanal só se negoceia em contratos TVDE.',
  'rent-a-car não negoceia preço semanal'
);

select ok(
  (select p.estado = 'pendente' and c.preco_semana_acordado is null and c.valor_total_manual = 900
     from public.pedidos_alteracao_contrato p
     join public.contratos_renting c on c.id = p.contrato_id
    where p.id = '00000000-0000-0000-0000-0000000d1b03'),
  'a recusa não deixa o pedido respondido nem mexe no contrato'
);

select * from finish();
rollback;
