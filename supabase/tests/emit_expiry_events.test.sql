-- ============================================================
-- Motor de Automação — emit_expiry_events() (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre a primeira fonte real de eventos do Event Bus: um scan diário que
-- deteta viaturas/motoristas a entrar na janela de 15 dias para expirar
-- (seguro, IPO, carta, licença TVDE) e publica em domain_events, com
-- dedup contra eventos ainda não processados da mesma entidade+tipo.
-- ============================================================

begin;
select plan(9);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org A', 'automacao-eventos-a');

-- v1: seguro a expirar em 10 dias — deve emitir.
-- v2: seguro a expirar em 100 dias — NÃO deve emitir.
-- v3: seguro a expirar em 5 dias, mas vendida — NÃO deve emitir.
-- v4: inspeção (IPO) a expirar em 3 dias — deve emitir.
insert into public.viaturas (id, org_id, matricula, marca, modelo, seguro_validade, inspecao_validade, is_vendida) values
  ('00000000-0000-0000-0000-00000081e001', '00000000-0000-0000-0000-0000000a0000', 'AA-11-AA', 'Toyota', 'Corolla', current_date + 10, current_date + 400, false),
  ('00000000-0000-0000-0000-00000082e001', '00000000-0000-0000-0000-0000000a0000', 'AA-22-AA', 'Toyota', 'Corolla', current_date + 100, current_date + 400, false),
  ('00000000-0000-0000-0000-00000083e001', '00000000-0000-0000-0000-0000000a0000', 'AA-33-AA', 'Toyota', 'Corolla', current_date + 5, current_date + 400, true),
  ('00000000-0000-0000-0000-00000084e001', '00000000-0000-0000-0000-0000000a0000', 'AA-44-AA', 'Toyota', 'Corolla', current_date + 400, current_date + 3, false);

-- m1: carta a expirar em 7 dias — deve emitir.
-- m2: licença TVDE a expirar em 2 dias — deve emitir.
-- m3: carta a expirar em 200 dias — NÃO deve emitir.
insert into public.motoristas_ativos (id, org_id, nome, carta_validade, licenca_tvde_validade, status_ativo) values
  ('00000000-0000-0000-0000-000000e1e001', '00000000-0000-0000-0000-0000000a0000', 'Motorista Um', current_date + 7, current_date + 400, true),
  ('00000000-0000-0000-0000-000000e2e001', '00000000-0000-0000-0000-0000000a0000', 'Motorista Dois', current_date + 400, current_date + 2, true),
  ('00000000-0000-0000-0000-000000e3e001', '00000000-0000-0000-0000-0000000a0000', 'Motorista Três', current_date + 200, current_date + 400, true);

select public.emit_expiry_events();

-- 1. Seguro a expirar em 10 dias emite.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-00000081e001' and event_type = 'viatura.seguro_expirando'),
  1,
  'seguro a expirar em 10 dias emite viatura.seguro_expirando'
);

-- 2. Seguro a expirar em 100 dias NÃO emite.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-00000082e001' and event_type = 'viatura.seguro_expirando'),
  0,
  'seguro a expirar em 100 dias não emite'
);

-- 3. Viatura vendida, mesmo com seguro a expirar em 5 dias, NÃO emite.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-00000083e001' and event_type = 'viatura.seguro_expirando'),
  0,
  'viatura vendida (is_vendida=true) é excluída mesmo com seguro a expirar'
);

-- 4. IPO a expirar em 3 dias emite.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-00000084e001' and event_type = 'viatura.inspecao_expirando'),
  1,
  'IPO a expirar em 3 dias emite viatura.inspecao_expirando'
);

-- 5. Carta do motorista a expirar em 7 dias emite.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000e1e001' and event_type = 'motorista.carta_expirando'),
  1,
  'carta a expirar em 7 dias emite motorista.carta_expirando'
);

-- 6. Licença TVDE a expirar em 2 dias emite.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000e2e001' and event_type = 'motorista.licenca_tvde_expirando'),
  1,
  'licença TVDE a expirar em 2 dias emite motorista.licenca_tvde_expirando'
);

-- 7. Carta a expirar em 200 dias NÃO emite.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000e3e001' and event_type = 'motorista.carta_expirando'),
  0,
  'carta a expirar em 200 dias não emite'
);

-- 8. Correr outra vez sem processar o evento anterior: não duplica (dedup por processed_at IS NULL).
select public.emit_expiry_events();

select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-00000081e001' and event_type = 'viatura.seguro_expirando'),
  1,
  'correr o scan outra vez não duplica um evento ainda não processado'
);

-- 9. Depois de o evento ser processado, uma nova corrida volta a emitir.
update public.domain_events
set processed_at = now()
where entity_id = '00000000-0000-0000-0000-00000081e001' and event_type = 'viatura.seguro_expirando';

select public.emit_expiry_events();

select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-00000081e001' and event_type = 'viatura.seguro_expirando'),
  2,
  'depois de processado, a condição ainda verdadeira volta a emitir um novo evento'
);

select * from finish();
rollback;
