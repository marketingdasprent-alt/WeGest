-- ============================================================
-- Fila Primavera: tipo 'pdf' — pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Ver a migração 20261014170000. Provas:
--   (1) um job 'pdf' entra na fila; 'emit' e 'health' continuam aceites;
--   (2) um tipo inventado é recusado;
--   (3) um pdf reclamado há mais de 2 minutos volta à fila e nunca fica ambiguo
--       (imprimir não cria documento; ambiguo é só para emit).
-- ============================================================

begin;
select plan(5);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000b0f0000', 'Org Fila Primavera PDF', 'fila-primavera-pdf');

-- Inactiva de propósito: o índice de "uma activa por empresa" não interessa aqui.
insert into public.plataformas_configuracao (id, org_id, nome, plataforma, config, client_secret, ativo) values
  ('00000000-0000-0000-0000-00000b0f0a01', '00000000-0000-0000-0000-00000b0f0000', 'Primavera PDF', 'faturacao',
   '{"provider":"primavera"}'::jsonb, 'pva_integracao_pdf', false);

-- ── (1) e (2) Tipos aceites ────────────────────────────────

select lives_ok(
  $$ insert into public.primavera_jobs (id, org_id, integracao_id, tipo, payload, expires_at) values
       ('00000000-0000-0000-0000-00000b0f1001', '00000000-0000-0000-0000-00000b0f0000',
        '00000000-0000-0000-0000-00000b0f0a01', 'pdf',
        '{"tipo_documento":"FA","serie":"2026","numero":"50"}', now() + interval '30 seconds') $$,
  'um job pdf entra na fila'
);

select lives_ok(
  $$ insert into public.primavera_jobs (org_id, integracao_id, tipo, payload) values
       ('00000000-0000-0000-0000-00000b0f0000', '00000000-0000-0000-0000-00000b0f0a01', 'emit', '{}'),
       ('00000000-0000-0000-0000-00000b0f0000', '00000000-0000-0000-0000-00000b0f0a01', 'health', '{}') $$,
  'emit e health continuam aceites'
);

select throws_ok(
  $$ insert into public.primavera_jobs (org_id, integracao_id, tipo, payload) values
       ('00000000-0000-0000-0000-00000b0f0000', '00000000-0000-0000-0000-00000b0f0a01', 'inventado', '{}') $$,
  '23514',
  null,
  'um tipo inventado é recusado'
);

-- ── (3) pdf preso volta à fila ─────────────────────────────

insert into public.primavera_jobs (id, org_id, integracao_id, tipo, payload, status, claimed_at, created_at) values
  ('00000000-0000-0000-0000-00000b0f1002', '00000000-0000-0000-0000-00000b0f0000', '00000000-0000-0000-0000-00000b0f0a01',
   'pdf', '{"tipo_documento":"FA","serie":"2026","numero":"50"}', 'claimed',
   now() - interval '3 minutes', now() - interval '4 minutes');

create temporary table _claim_pdf as
  select id from public.primavera_jobs_claim_integracao('00000000-0000-0000-0000-00000b0f0a01', 10);

select ok(
  exists (select 1 from _claim_pdf where id = '00000000-0000-0000-0000-00000b0f1002'),
  'o pdf reclamado há 3 minutos volta à fila e é reclamado de novo'
);

select isnt(
  (select status from public.primavera_jobs where id = '00000000-0000-0000-0000-00000b0f1002'),
  'ambiguo',
  'um pdf preso nunca fica ambiguo'
);

select * from finish();
rollback;
