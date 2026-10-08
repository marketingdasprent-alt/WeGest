-- ============================================================
-- Fila Primavera por integração e sem reemissão: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Ver a migração 20261008100000. Provas:
--   (1) o claim de uma integração só devolve os jobs dela; os da outra ficam;
--   (2) um emit reclamado há mais de 2 minutos passa a ambiguo e não volta à
--       fila; um health na mesma situação volta e é reclamado de novo;
--   (3) um pendente expirado fecha como failed sem ter corrido;
--   (4) a segunda chamada não devolve o que já foi reclamado;
--   (5) o claim por organização deixou de existir e só a service role chama o novo;
--   (6) o estado ambiguo é aceite e um estado inventado não.
-- ============================================================

begin;
select plan(12);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000a0e0000', 'Org Fila Primavera', 'fila-primavera-a');

-- Duas integrações Primavera na mesma organização (duas empresas emissoras).
-- Inactivas de propósito: o índice de "uma activa por empresa" não interessa aqui.
insert into public.plataformas_configuracao (id, org_id, nome, plataforma, config, client_secret, ativo) values
  ('00000000-0000-0000-0000-00000a0e0a01', '00000000-0000-0000-0000-00000a0e0000', 'Primavera A', 'faturacao',
   '{"provider":"primavera"}'::jsonb, 'pva_integracao_a', false),
  ('00000000-0000-0000-0000-00000a0e0b01', '00000000-0000-0000-0000-00000a0e0000', 'Primavera B', 'faturacao',
   '{"provider":"primavera"}'::jsonb, 'pva_integracao_b', false);

insert into public.primavera_jobs (id, org_id, integracao_id, tipo, payload, status, claimed_at, expires_at, created_at) values
  -- A1: emit pendente, normal.
  ('00000000-0000-0000-0000-00000a0e1001', '00000000-0000-0000-0000-00000a0e0000', '00000000-0000-0000-0000-00000a0e0a01',
   'emit', '{"tipo":"FT"}', 'pending', null, now() + interval '1 minute', now() - interval '10 seconds'),
  -- A2: health pendente.
  ('00000000-0000-0000-0000-00000a0e1002', '00000000-0000-0000-0000-00000a0e0000', '00000000-0000-0000-0000-00000a0e0a01',
   'health', '{}', 'pending', null, null, now() - interval '9 seconds'),
  -- A3: emit reclamado há 3 minutos sem resultado.
  ('00000000-0000-0000-0000-00000a0e1003', '00000000-0000-0000-0000-00000a0e0000', '00000000-0000-0000-0000-00000a0e0a01',
   'emit', '{"tipo":"FT"}', 'claimed', now() - interval '3 minutes', null, now() - interval '5 minutes'),
  -- A4: health reclamado há 3 minutos sem resultado.
  ('00000000-0000-0000-0000-00000a0e1004', '00000000-0000-0000-0000-00000a0e0000', '00000000-0000-0000-0000-00000a0e0a01',
   'health', '{}', 'claimed', now() - interval '3 minutes', null, now() - interval '4 minutes'),
  -- A5: emit pendente já expirado.
  ('00000000-0000-0000-0000-00000a0e1005', '00000000-0000-0000-0000-00000a0e0000', '00000000-0000-0000-0000-00000a0e0a01',
   'emit', '{"tipo":"FT"}', 'pending', null, now() - interval '1 minute', now() - interval '3 minutes'),
  -- B1: emit pendente da OUTRA integração.
  ('00000000-0000-0000-0000-00000a0e2001', '00000000-0000-0000-0000-00000a0e0000', '00000000-0000-0000-0000-00000a0e0b01',
   'emit', '{"tipo":"FT"}', 'pending', null, now() + interval '1 minute', now() - interval '8 seconds');

-- ── (1) a (3): claim da integração A ────────────────────────

create temporary table _claim_a as
  select id from public.primavera_jobs_claim_integracao('00000000-0000-0000-0000-00000a0e0a01', 10);

select is(
  (select count(*)::int from _claim_a),
  3,
  'a integração A reclama 3: o emit pendente, o health pendente e o health preso que voltou à fila'
);

select ok(
  exists (select 1 from _claim_a where id = '00000000-0000-0000-0000-00000a0e1004'),
  'o health reclamado há 3 minutos volta à fila e é reclamado de novo'
);

select is(
  (select status from public.primavera_jobs where id = '00000000-0000-0000-0000-00000a0e1003'),
  'ambiguo',
  'o emit reclamado há 3 minutos fica ambiguo, nunca volta à fila'
);

select ok(
  (select error_message ilike '%confirmar no Primavera%' from public.primavera_jobs
    where id = '00000000-0000-0000-0000-00000a0e1003'),
  'e diz para confirmar no Primavera antes de reemitir'
);

select is(
  (select status from public.primavera_jobs where id = '00000000-0000-0000-0000-00000a0e1005'),
  'failed',
  'o emit pendente já expirado fecha como failed sem ter corrido'
);

select is(
  (select status from public.primavera_jobs where id = '00000000-0000-0000-0000-00000a0e2001'),
  'pending',
  'o job da integração B fica onde estava'
);

-- ── (4) Segunda chamada ────────────────────────────────────

select is(
  (select count(*)::int from public.primavera_jobs_claim_integracao('00000000-0000-0000-0000-00000a0e0a01', 10)),
  0,
  'uma segunda reclamação da A não devolve nada'
);

select is(
  (select count(*)::int from public.primavera_jobs_claim_integracao('00000000-0000-0000-0000-00000a0e0b01', 10)),
  1,
  'a integração B reclama só o seu'
);

-- ── (5) Função antiga e grants ─────────────────────────────

select ok(
  not exists (select 1 from pg_proc where proname = 'primavera_jobs_claim'),
  'o claim por organização deixou de existir'
);

select ok(
  not has_function_privilege('authenticated', 'public.primavera_jobs_claim_integracao(uuid, integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.primavera_jobs_claim_integracao(uuid, integer)', 'EXECUTE'),
  'só a service role chama o claim novo'
);

-- ── (6) Estados ────────────────────────────────────────────

select lives_ok(
  $$ update public.primavera_jobs set status = 'ambiguo' where id = '00000000-0000-0000-0000-00000a0e1001' $$,
  'o estado ambiguo é aceite'
);

select throws_ok(
  $$ update public.primavera_jobs set status = 'inventado' where id = '00000000-0000-0000-0000-00000a0e1001' $$,
  '23514',
  null,
  'um estado inventado é recusado'
);

select * from finish();
rollback;
