-- ============================================================
-- Teto da NC pelo total fiscal e travão da faturação (20261112100000)
-- ============================================================
-- Em 10/2026 a conta da Dasp Rent Sul emitiu faturas com GrossTotal 1115,00 para uma
-- cobrança de 1371,45 e depois NC de 1371,45. O trigger passa a limitar pelo menor
-- entre a cobrança e a fatura emitida; sem fatura emitida vale o valor da cobrança.
-- O desbloqueio da integração só é permitido a um admin da mesma organização.
-- ============================================================
begin;
select plan(21);

-- Bootstrap antes das organizações: consome a vaga do primeiro utilizador.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000009e00ff', 'bootstrap@teto-fiscal.pt'),
  ('00000000-0000-0000-0000-0000009e0a01', 'admin-a@teto-fiscal.pt'),
  ('00000000-0000-0000-0000-0000009e0a02', 'comum-a@teto-fiscal.pt'),
  ('00000000-0000-0000-0000-0000009e0b01', 'admin-b@teto-fiscal.pt'),
  ('00000000-0000-0000-0000-0000009e0a03', 'fatura-a@teto-fiscal.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000009e0a00', 'Org Teto A', 'teto-fiscal-a'),
  ('00000000-0000-0000-0000-0000009e0b00', 'Org Teto B', 'teto-fiscal-b');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000009e0a01', '00000000-0000-0000-0000-0000009e0a00'),
  ('00000000-0000-0000-0000-0000009e0a02', '00000000-0000-0000-0000-0000009e0a00'),
  ('00000000-0000-0000-0000-0000009e0b01', '00000000-0000-0000-0000-0000009e0b00'),
  ('00000000-0000-0000-0000-0000009e0a03', '00000000-0000-0000-0000-0000009e0a00');

-- Cargo só com financeiro_recibos: tem acesso à faturação mas não a contratos (nem às faturas).
insert into public.recursos (nome, categoria)
select 'financeiro_recibos', 'financeiro'
where not exists (select 1 from public.recursos where nome = 'financeiro_recibos');

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-0000009ec001', 'So Recibos', '00000000-0000-0000-0000-0000009e0a00');

insert into public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
select '00000000-0000-0000-0000-0000009ec001', r.id, '00000000-0000-0000-0000-0000009e0a00', true, true
from public.recursos r where r.nome = 'financeiro_recibos';

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000009e0a01', '00000000-0000-0000-0000-0000009e0a00', true, null),
  ('00000000-0000-0000-0000-0000009e0a02', '00000000-0000-0000-0000-0000009e0a00', false, null),
  ('00000000-0000-0000-0000-0000009e0b01', '00000000-0000-0000-0000-0000009e0b00', true, null),
  ('00000000-0000-0000-0000-0000009e0a03', '00000000-0000-0000-0000-0000009e0a00', false, '00000000-0000-0000-0000-0000009ec001');

insert into public.clientes (id, org_id, nome, email, tipo_cliente, created_by) values
  ('00000000-0000-0000-0000-0000009e0f0a', '00000000-0000-0000-0000-0000009e0a00', 'Cliente A', 'a@teto-fiscal.pt', 'particular', '00000000-0000-0000-0000-0000009e0a01');

-- Uma reserva por cobrança (cobranças só de reserva, sem contrato).
insert into public.reservas (id, org_id, estado, regime, data_inicio, data_fim, cliente_id, created_by) values
  ('00000000-0000-0000-0000-0000009e0e01', '00000000-0000-0000-0000-0000009e0a00', 'confirmada', 'rent_a_car', now() + interval '10 days', now() + interval '13 days', '00000000-0000-0000-0000-0000009e0f0a', '00000000-0000-0000-0000-0000009e0a01'),
  ('00000000-0000-0000-0000-0000009e0e02', '00000000-0000-0000-0000-0000009e0a00', 'confirmada', 'rent_a_car', now() + interval '20 days', now() + interval '23 days', '00000000-0000-0000-0000-0000009e0f0a', '00000000-0000-0000-0000-0000009e0a01'),
  ('00000000-0000-0000-0000-0000009e0e03', '00000000-0000-0000-0000-0000009e0a00', 'confirmada', 'rent_a_car', now() + interval '30 days', now() + interval '33 days', '00000000-0000-0000-0000-0000009e0f0a', '00000000-0000-0000-0000-0000009e0a01');

-- valor_sem_iva 1115,00 + IVA 23 % = valor_total 1371,45 (o caso real da Dasp Rent Sul).
-- c1: fatura com total_fiscal 1115,00. c2: fatura sem total_fiscal (só total). c3: sem fatura.
insert into public.contrato_cobrancas (id, org_id, contrato_id, reserva_id, periodo_de, periodo_ate, destinatario_id,
                                       destinatario_papel, destinatario_nome, valor_sem_iva, estado) values
  ('00000000-0000-0000-0000-0000009e0c01', '00000000-0000-0000-0000-0000009e0a00', null, '00000000-0000-0000-0000-0000009e0e01', current_date + 10, current_date + 13, '00000000-0000-0000-0000-0000009e0f0a', 'cliente', 'Cliente A', 1115.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009e0c02', '00000000-0000-0000-0000-0000009e0a00', null, '00000000-0000-0000-0000-0000009e0e02', current_date + 20, current_date + 23, '00000000-0000-0000-0000-0000009e0f0a', 'cliente', 'Cliente A', 1115.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009e0c03', '00000000-0000-0000-0000-0000009e0a00', null, '00000000-0000-0000-0000-0000009e0e03', current_date + 30, current_date + 33, '00000000-0000-0000-0000-0000009e0f0a', 'cliente', 'Cliente A', 1115.00, 'emitida');

insert into public.invoices (id, org_id, cobranca_id, tipo, serie, numero, data_emissao, total, total_fiscal, status) values
  ('00000000-0000-0000-0000-0000009e0a11', '00000000-0000-0000-0000-0000009e0a00', '00000000-0000-0000-0000-0000009e0c01', 'FT', 'FT 2026', '1', current_date, 1371.45, 1115.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009e0a12', '00000000-0000-0000-0000-0000009e0a00', '00000000-0000-0000-0000-0000009e0c02', 'FT', 'FT 2026', '2', current_date, 1115.00, null, 'emitida');

insert into public.plataformas_configuracao (id, org_id, plataforma, nome, faturacao_bloqueada_em, faturacao_bloqueio_motivo) values
  ('00000000-0000-0000-0000-0000009e0d0a', '00000000-0000-0000-0000-0000009e0a00', 'faturacao', 'KeyInvoice A', now(), 'Documento FT 2026/1: esperado 1371.45, real 1115.00'),
  ('00000000-0000-0000-0000-0000009e0d0b', '00000000-0000-0000-0000-0000009e0b00', 'faturacao', 'KeyInvoice B', now(), 'Documento FT B/1: esperado 100.00, real 80.00');

-- ── Trigger das NC ──────────────────────────────────────────

select has_column('public', 'invoices', 'total_fiscal', 'invoices tem total_fiscal');

select throws_like(
  $$ insert into public.notas_credito (org_id, cobranca_id, entidade_id, valor, motivo)
     values ('00000000-0000-0000-0000-0000009e0a00', '00000000-0000-0000-0000-0000009e0c01', '00000000-0000-0000-0000-0000009e0f0a', 1371.45, 'Teste') $$,
  '%excede o saldo por creditar%fatura emitida vale 1115.00%',
  'NC de 1371,45 sobre uma fatura de total fiscal 1115,00 é recusada'
);

select lives_ok(
  $$ insert into public.notas_credito (org_id, cobranca_id, entidade_id, valor, motivo)
     values ('00000000-0000-0000-0000-0000009e0a00', '00000000-0000-0000-0000-0000009e0c01', '00000000-0000-0000-0000-0000009e0f0a', 1000.00, 'Teste') $$,
  'NC dentro do total fiscal passa'
);

select throws_like(
  $$ insert into public.notas_credito (org_id, cobranca_id, entidade_id, valor, motivo)
     values ('00000000-0000-0000-0000-0000009e0a00', '00000000-0000-0000-0000-0000009e0c01', '00000000-0000-0000-0000-0000009e0f0a', 120.00, 'Teste') $$,
  '%excede o saldo por creditar%',
  'o que já foi creditado conta: 1000 + 120 passa de 1115'
);

select lives_ok(
  $$ insert into public.notas_credito (org_id, cobranca_id, entidade_id, valor, motivo)
     values ('00000000-0000-0000-0000-0000009e0a00', '00000000-0000-0000-0000-0000009e0c01', '00000000-0000-0000-0000-0000009e0f0a', 115.00, 'Teste') $$,
  'o saldo exacto (1115 - 1000) ainda passa'
);

-- Sem total_fiscal usa o total da fatura (1115,00): a NC de 1371,45 também é recusada.
select throws_like(
  $$ insert into public.notas_credito (org_id, cobranca_id, entidade_id, valor, motivo)
     values ('00000000-0000-0000-0000-0000009e0a00', '00000000-0000-0000-0000-0000009e0c02', '00000000-0000-0000-0000-0000009e0f0a', 1371.45, 'Teste') $$,
  '%fatura emitida vale 1115.00%',
  'sem total_fiscal vale o total da fatura emitida'
);

-- Sem fatura emitida mantém-se a regra antiga: o teto é o valor_total da cobrança.
select lives_ok(
  $$ insert into public.notas_credito (org_id, cobranca_id, entidade_id, valor, motivo)
     values ('00000000-0000-0000-0000-0000009e0a00', '00000000-0000-0000-0000-0000009e0c03', '00000000-0000-0000-0000-0000009e0f0a', 1371.45, 'Teste') $$,
  'sem fatura emitida a NC pode ir até ao valor_total da cobrança'
);

select throws_like(
  $$ insert into public.notas_credito (org_id, cobranca_id, entidade_id, valor, motivo)
     values ('00000000-0000-0000-0000-0000009e0a00', '00000000-0000-0000-0000-0000009e0c03', '00000000-0000-0000-0000-0000009e0f0a', 0.50, 'Teste') $$,
  '%excede o saldo por creditar da cobrança%',
  'sem fatura emitida a recusa mantém a mensagem antiga'
);

-- ── RPC de desbloqueio ──────────────────────────────────────

select ok(not has_function_privilege('anon', 'public.desbloquear_faturacao_integracao(uuid)', 'EXECUTE'),
  'anon não executa o desbloqueio');
select ok(has_function_privilege('authenticated', 'public.desbloquear_faturacao_integracao(uuid)', 'EXECUTE'),
  'authenticated executa o desbloqueio (o check de admin é interno)');

-- Utilizador comum da org A.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009e0a02', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009e0a02","role":"authenticated"}', true);

select throws_ok(
  $$ select public.desbloquear_faturacao_integracao('00000000-0000-0000-0000-0000009e0d0a') $$,
  '42501', null,
  'quem não é admin não desbloqueia'
);

-- Admin da org A.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009e0a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009e0a01","role":"authenticated"}', true);

select throws_ok(
  $$ select public.desbloquear_faturacao_integracao('00000000-0000-0000-0000-0000009e0d0b') $$,
  '42501', null,
  'um admin não desbloqueia a integração de outra organização'
);

select lives_ok(
  $$ select public.desbloquear_faturacao_integracao('00000000-0000-0000-0000-0000009e0d0a') $$,
  'um admin da mesma organização desbloqueia'
);

select ok(
  (select faturacao_bloqueada_em is null and faturacao_bloqueio_motivo is null
     from public.plataformas_configuracao where id = '00000000-0000-0000-0000-0000009e0d0a')
  and (select faturacao_bloqueada_em is not null
     from public.plataformas_configuracao where id = '00000000-0000-0000-0000-0000009e0d0b'),
  'limpou os dois campos na sua integração e a da outra organização ficou travada'
);

-- ── Helper do total fiscal (lê sem RLS, só da org do chamador) ──

select ok(not has_function_privilege('anon', 'public.total_fiscal_da_cobranca(uuid,uuid)', 'EXECUTE'),
  'anon não executa o helper do total fiscal');
select ok(has_function_privilege('authenticated', 'public.total_fiscal_da_cobranca(uuid,uuid)', 'EXECUTE'),
  'authenticated executa o helper (o trigger corre como o utilizador; o check de org é interno)');
select ok(has_function_privilege('service_role', 'public.total_fiscal_da_cobranca(uuid,uuid)', 'EXECUTE'),
  'service_role executa o helper');

-- Utilizador com faturação mas sem contratos: a RLS esconde-lhe as faturas.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009e0a03', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009e0a03","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from public.invoices where cobranca_id = '00000000-0000-0000-0000-0000009e0c01')::int,
  0,
  'premissa: sem acesso a contratos a RLS esconde as faturas'
);
select throws_ok(
  $$ select public.total_fiscal_da_cobranca('00000000-0000-0000-0000-0000009e0c01', '00000000-0000-0000-0000-0000009e0a00') $$,
  '42501', null,
  'chamado diretamente (fora do trigger) o helper recusa, mesmo na org do utilizador: não é um oráculo de totais'
);

-- Admin da org B não lê totais da org A.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000009e0b01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009e0b01","role":"authenticated"}', true);

select throws_ok(
  $$ select public.total_fiscal_da_cobranca('00000000-0000-0000-0000-0000009e0c01', '00000000-0000-0000-0000-0000009e0a00') $$,
  '42501', null,
  'um utilizador de outra organização não lê totais da org A pelo helper'
);
select throws_ok(
  $$ select public.total_fiscal_da_cobranca('00000000-0000-0000-0000-0000009e0c01', '00000000-0000-0000-0000-0000009e0b00') $$,
  '42501', null,
  'também com a sua própria org, a chamada direta do admin da org B é recusada'
);

reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
