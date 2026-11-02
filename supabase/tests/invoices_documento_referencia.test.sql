-- ============================================================
-- Notas de crédito ligadas à fatura que corrigem (20261102170000)
-- ============================================================
-- O teto das NC soma o que já foi creditado contra cada fatura. O backfill das NC
-- antigas só liga por cobrança quando a cobrança tem UMA fatura (FT/FR) na mesma
-- org: com duas fica por ligar, e nunca atravessa organizações.
-- A migração já correu sobre uma base vazia, por isso repete-se aqui a função que
-- ela usa, sobre dados deste teste.
-- ============================================================
begin;
select plan(10);

-- Bootstrap antes das organizações: consome a vaga do primeiro utilizador.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000009d00ff', 'bootstrap@doc-ref.pt'),
  ('00000000-0000-0000-0000-0000009d0001', 'gestor@doc-ref.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000009d0a00', 'Org Doc Ref A', 'doc-ref-a'),
  ('00000000-0000-0000-0000-0000009d0b00', 'Org Doc Ref B', 'doc-ref-b');

insert into public.clientes (id, org_id, nome, email, tipo_cliente, created_by) values
  ('00000000-0000-0000-0000-0000009d0f0a', '00000000-0000-0000-0000-0000009d0a00', 'Cliente A', 'a@doc-ref.pt', 'particular', '00000000-0000-0000-0000-0000009d0001'),
  ('00000000-0000-0000-0000-0000009d0f0b', '00000000-0000-0000-0000-0000009d0b00', 'Cliente B', 'b@doc-ref.pt', 'particular', '00000000-0000-0000-0000-0000009d0001');

-- Uma reserva por cobrança (cobranças só de reserva, sem contrato).
insert into public.reservas (id, org_id, estado, regime, data_inicio, data_fim, cliente_id, created_by) values
  ('00000000-0000-0000-0000-0000009d0b01', '00000000-0000-0000-0000-0000009d0a00', 'confirmada', 'rent_a_car', now() + interval '10 days', now() + interval '13 days', '00000000-0000-0000-0000-0000009d0f0a', '00000000-0000-0000-0000-0000009d0001'),
  ('00000000-0000-0000-0000-0000009d0b02', '00000000-0000-0000-0000-0000009d0a00', 'confirmada', 'rent_a_car', now() + interval '20 days', now() + interval '23 days', '00000000-0000-0000-0000-0000009d0f0a', '00000000-0000-0000-0000-0000009d0001'),
  ('00000000-0000-0000-0000-0000009d0b03', '00000000-0000-0000-0000-0000009d0a00', 'confirmada', 'rent_a_car', now() + interval '30 days', now() + interval '33 days', '00000000-0000-0000-0000-0000009d0f0a', '00000000-0000-0000-0000-0000009d0001'),
  ('00000000-0000-0000-0000-0000009d0b05', '00000000-0000-0000-0000-0000009d0a00', 'confirmada', 'rent_a_car', now() + interval '40 days', now() + interval '43 days', '00000000-0000-0000-0000-0000009d0f0a', '00000000-0000-0000-0000-0000009d0001'),
  ('00000000-0000-0000-0000-0000009d0b04', '00000000-0000-0000-0000-0000009d0b00', 'confirmada', 'rent_a_car', now() + interval '10 days', now() + interval '13 days', '00000000-0000-0000-0000-0000009d0f0b', '00000000-0000-0000-0000-0000009d0001');

-- cobA1: uma fatura. cobA2: duas (FT e FR). cobA3: nenhuma. cobB1: uma, na org B.
-- cobA4: uma FT emitida e uma FT anulada (só a emitida conta).
insert into public.contrato_cobrancas (id, org_id, contrato_id, reserva_id, periodo_de, periodo_ate, destinatario_id,
                                       destinatario_papel, destinatario_nome, valor_sem_iva) values
  ('00000000-0000-0000-0000-0000009d0c01', '00000000-0000-0000-0000-0000009d0a00', null, '00000000-0000-0000-0000-0000009d0b01', current_date + 10, current_date + 13, '00000000-0000-0000-0000-0000009d0f0a', 'cliente', 'Cliente A', 100),
  ('00000000-0000-0000-0000-0000009d0c02', '00000000-0000-0000-0000-0000009d0a00', null, '00000000-0000-0000-0000-0000009d0b02', current_date + 20, current_date + 23, '00000000-0000-0000-0000-0000009d0f0a', 'cliente', 'Cliente A', 100),
  ('00000000-0000-0000-0000-0000009d0c03', '00000000-0000-0000-0000-0000009d0a00', null, '00000000-0000-0000-0000-0000009d0b03', current_date + 30, current_date + 33, '00000000-0000-0000-0000-0000009d0f0a', 'cliente', 'Cliente A', 100),
  ('00000000-0000-0000-0000-0000009d0c05', '00000000-0000-0000-0000-0000009d0a00', null, '00000000-0000-0000-0000-0000009d0b05', current_date + 40, current_date + 43, '00000000-0000-0000-0000-0000009d0f0a', 'cliente', 'Cliente A', 100),
  ('00000000-0000-0000-0000-0000009d0c04', '00000000-0000-0000-0000-0000009d0b00', null, '00000000-0000-0000-0000-0000009d0b04', current_date + 10, current_date + 13, '00000000-0000-0000-0000-0000009d0f0b', 'cliente', 'Cliente B', 100);

-- Faturas: a1 (única em cobA1), a2 e a3 (ambíguas em cobA2), b1 (única em cobB1).
insert into public.invoices (id, org_id, cobranca_id, tipo, serie, numero, data_emissao, total, status) values
  ('00000000-0000-0000-0000-0000009d0a11', '00000000-0000-0000-0000-0000009d0a00', '00000000-0000-0000-0000-0000009d0c01', 'FT', 'FT 2026', '1', current_date, 123.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009d0a12', '00000000-0000-0000-0000-0000009d0a00', '00000000-0000-0000-0000-0000009d0c02', 'FT', 'FT 2026', '2', current_date, 123.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009d0a13', '00000000-0000-0000-0000-0000009d0a00', '00000000-0000-0000-0000-0000009d0c02', 'FR', 'FR 2026', '3', current_date, 123.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009d0b11', '00000000-0000-0000-0000-0000009d0b00', '00000000-0000-0000-0000-0000009d0c04', 'FT', 'FT B', '1', current_date, 123.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009d0a14', '00000000-0000-0000-0000-0000009d0a00', '00000000-0000-0000-0000-0000009d0c05', 'FT', 'FT 2026', '4', current_date, 123.00, 'anulada'),
  ('00000000-0000-0000-0000-0000009d0a15', '00000000-0000-0000-0000-0000009d0a00', '00000000-0000-0000-0000-0000009d0c05', 'FT', 'FT 2026', '5', current_date, 123.00, 'emitida');

-- NC antigas, sem ligação: n1 (cobA1), n2 (cobA2, ambígua), n3 (cobA3, sem fatura),
-- n4 (org B mas com a cobrança da org A), n5 (cobB1).
insert into public.invoices (id, org_id, cobranca_id, tipo, serie, numero, data_emissao, total, status) values
  ('00000000-0000-0000-0000-0000009d0e01', '00000000-0000-0000-0000-0000009d0a00', '00000000-0000-0000-0000-0000009d0c01', 'NC', 'NC 2026', '1', current_date, 50.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009d0e02', '00000000-0000-0000-0000-0000009d0a00', '00000000-0000-0000-0000-0000009d0c02', 'NC', 'NC 2026', '2', current_date, 50.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009d0e03', '00000000-0000-0000-0000-0000009d0a00', '00000000-0000-0000-0000-0000009d0c03', 'NC', 'NC 2026', '3', current_date, 50.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009d0e04', '00000000-0000-0000-0000-0000009d0b00', '00000000-0000-0000-0000-0000009d0c01', 'NC', 'NC B', '4', current_date, 50.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009d0e05', '00000000-0000-0000-0000-0000009d0b00', '00000000-0000-0000-0000-0000009d0c04', 'NC', 'NC B', '5', current_date, 50.00, 'emitida'),
  ('00000000-0000-0000-0000-0000009d0e06', '00000000-0000-0000-0000-0000009d0a00', '00000000-0000-0000-0000-0000009d0c05', 'NC', 'NC 2026', '6', current_date, 50.00, 'emitida');

select has_column('public', 'invoices', 'documento_referencia_id', 'invoices tem documento_referencia_id');
select has_index('public', 'invoices', 'idx_invoices_documento_referencia_id', 'índice parcial da ligação');

select is(public.invoices_ligar_nc_ao_original(), 3, 'só 3 NC ficam ligadas: as das cobranças com uma única fatura emitida na própria org');

select is((select documento_referencia_id from public.invoices where id = '00000000-0000-0000-0000-0000009d0e01'),
  '00000000-0000-0000-0000-0000009d0a11'::uuid, 'NC da cobrança com uma fatura liga-se a ela');
select ok((select documento_referencia_id is null from public.invoices where id = '00000000-0000-0000-0000-0000009d0e02'),
  'cobrança com FT e FR é ambígua: a NC fica por ligar');
select ok((select documento_referencia_id is null from public.invoices where id = '00000000-0000-0000-0000-0000009d0e03'),
  'cobrança sem fatura: a NC fica por ligar');
select ok((select documento_referencia_id is null from public.invoices where id = '00000000-0000-0000-0000-0000009d0e04'),
  'NC da org B com a cobrança da org A não se liga à fatura da org A');
select is((select documento_referencia_id from public.invoices where id = '00000000-0000-0000-0000-0000009d0e05'),
  '00000000-0000-0000-0000-0000009d0b11'::uuid, 'na org B liga-se à fatura da própria org B');

select is((select documento_referencia_id from public.invoices where id = '00000000-0000-0000-0000-0000009d0e06'),
  '00000000-0000-0000-0000-0000009d0a15'::uuid, 'com uma FT emitida e outra anulada, a NC liga-se à emitida');

select is(public.invoices_ligar_nc_ao_original(), 0, 'repetir não liga mais nada');

select * from finish();
rollback;
