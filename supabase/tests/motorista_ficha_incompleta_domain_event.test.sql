-- ============================================================
-- "Lembrete ao motorista sobre ficha incompleta" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Item 10/13 da lista do chefe. Reutiliza a definição canónica de
-- "ficha incompleta" já existente em src/lib/motoristaFichaCompleta.ts
-- (CAMPOS_FICHA_OBRIGATORIOS: nif, email, iban, telefone,
-- documento_tipo, documento_numero, documento_validade), mas em vez de
-- avisar o staff (Motoristas.tsx), lembra o PRÓPRIO motorista
-- (destinatarios_estrategia='motorista', mesmo mecanismo do item 8).
-- ============================================================

begin;
select plan(5);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f1000', 'Org Ficha F1', 'fic-f1');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f1001', 'driver.portal@fic-f1.pt');

-- Motorista A: ativo, com conta no portal, faltam NIF e IBAN — deve disparar.
insert into public.motoristas_ativos (id, nome, org_id, user_id, email, telefone, documento_tipo, documento_numero, documento_validade, status_ativo, nif, iban) values
  ('00000000-0000-0000-0000-0000000f1010', 'Motorista Ficha Incompleta', '00000000-0000-0000-0000-0000000f1000',
   '00000000-0000-0000-0000-0000000f1001', 'driver.portal@fic-f1.pt', '912345678', 'cc', '123456', current_date + 365, true, null, null);

-- Motorista B: ativo, ficha completa (todos os 7 campos preenchidos) — NÃO deve disparar.
insert into public.motoristas_ativos (id, nome, org_id, email, telefone, documento_tipo, documento_numero, documento_validade, status_ativo, nif, iban) values
  ('00000000-0000-0000-0000-0000000f1011', 'Motorista Ficha Completa', '00000000-0000-0000-0000-0000000f1000',
   'driver.completa@fic-f1.pt', '912345679', 'cc', '654321', current_date + 365, true, '123456789', 'PT50000201231234567890154');

-- Motorista C: inativo com ficha incompleta — fora de escopo, NÃO deve disparar.
insert into public.motoristas_ativos (id, nome, org_id, email, status_ativo, nif, iban, telefone, documento_tipo, documento_numero, documento_validade) values
  ('00000000-0000-0000-0000-0000000f1012', 'Motorista Inativo', '00000000-0000-0000-0000-0000000f1000',
   'driver.inativo@fic-f1.pt', false, null, null, null, null, null, null);

select public.emit_motoristas_ficha_incompleta_events();

-- 1. Motorista ativo com dados em falta publica o evento.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000f1010' and event_type = 'motorista.ficha_incompleta'),
  1,
  'motorista ativo com NIF/IBAN em falta publica motorista.ficha_incompleta'
);

-- 2. O payload lista corretamente os campos em falta.
select is(
  (select payload->'campos_em_falta' from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000f1010' and event_type = 'motorista.ficha_incompleta'),
  '["NIF", "IBAN"]'::jsonb,
  'payload lista exatamente os campos em falta (NIF, IBAN)'
);

-- 3. Motorista com ficha completa não dispara.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000f1011'),
  0,
  'motorista com ficha completa não dispara o alerta'
);

-- 4. Motorista inativo não dispara, mesmo com ficha incompleta.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-0000000f1012'),
  0,
  'motorista inativo não dispara o alerta'
);

select public.process_domain_events();
select public.execute_automation_runs();

-- 5. Motorista com conta no portal recebe a notificação in-app.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-0000000f1001' and template_codigo = 'motorista.ficha_incompleta'),
  1,
  'motorista com conta no portal recebe notificação in-app'
);

select * from finish();
rollback;
