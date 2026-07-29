-- ============================================================
-- "Envio de fatura ao cliente" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Item 11/13 da lista do chefe. NÃO automatiza emissão nem envio de
-- documentos fiscais (decisão já tomada anteriormente: isso fica
-- manual). O gap real: uma fatura pode ficar emitida sem NUNCA ter
-- sido enviada ao cliente por email — ação manual separada, sem
-- nenhum rasto até agora. Este teste cobre só o lembrete INTERNO ao
-- staff (Gestor TVDE), usando invoices.enviado_em como rasto.
-- ============================================================

begin;
select plan(4);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000130000', 'Org Fatura H', 'fat-h0');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000130001', 'admin@fat-h0.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000130001', '00000000-0000-0000-0000-000000130000', true);

-- Fatura A: emitida há 5 dias, nunca enviada — deve disparar.
insert into public.invoices (id, org_id, tipo, numero, data_emissao, total, cliente_nif, status, created_at) values
  ('00000000-0000-0000-0000-000000130010', '00000000-0000-0000-0000-000000130000', 'FT', 'FT 2026/1', current_date - 5, 150.00, '123456789', 'emitida', now() - interval '5 days');

-- Fatura B: emitida há 5 dias mas já enviada — NÃO deve disparar.
insert into public.invoices (id, org_id, tipo, numero, data_emissao, total, cliente_nif, status, created_at, enviado_em) values
  ('00000000-0000-0000-0000-000000130011', '00000000-0000-0000-0000-000000130000', 'FT', 'FT 2026/2', current_date - 5, 200.00, '123456780', 'emitida', now() - interval '5 days', now() - interval '4 days');

-- Fatura C: emitida há apenas 1 dia, nunca enviada — ainda dentro da janela de 3 dias, NÃO deve disparar.
insert into public.invoices (id, org_id, tipo, numero, data_emissao, total, cliente_nif, status, created_at) values
  ('00000000-0000-0000-0000-000000130012', '00000000-0000-0000-0000-000000130000', 'FT', 'FT 2026/3', current_date - 1, 90.00, '123456781', 'emitida', now() - interval '1 day');

select public.emit_faturas_nao_enviadas_events();

-- 1. Fatura emitida há 5 dias e nunca enviada publica o evento.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000130010' and event_type = 'invoice.nao_enviada_ao_cliente'),
  1,
  'fatura emitida há 5 dias e nunca enviada publica invoice.nao_enviada_ao_cliente'
);

-- 2. Fatura já enviada (enviado_em preenchido) não dispara.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000130011'),
  0,
  'fatura já enviada ao cliente não dispara o alerta'
);

-- 3. Fatura emitida há apenas 1 dia não dispara (dentro da janela de 3 dias).
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000130012'),
  0,
  'fatura emitida há apenas 1 dia não dispara o alerta'
);

select public.process_domain_events();
select public.execute_automation_runs();

-- 4. Staff recebe a notificação interna (nunca o cliente).
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-000000130001' and template_codigo = 'invoice.nao_enviada_ao_cliente'),
  1,
  'staff (admin da org) recebe o lembrete interno'
);

select * from finish();
rollback;
