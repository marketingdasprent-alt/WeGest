-- ============================================================
-- bolt_viagens: upsert sem mudanças não reescreve a linha (pgTAP)
-- ============================================================
-- O bolt-sync-semana faz upsert de semanas inteiras e reescrevia cada viagem
-- (dados_raw incluído) mesmo sem mudanças. O trigger da migração
-- 20261019140000 salta a escrita quando só o updated_at difere. O ctid só
-- muda quando a linha é mesmo reescrita.
-- ============================================================

begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000003b0000', 'Org Bolt Upsert', 'bolt-upsert-teste');

insert into public.plataformas_configuracao (id, org_id, nome, plataforma) values
  ('00000000-0000-0000-0000-0000003b0e01', '00000000-0000-0000-0000-0000003b0000', 'Bolt', 'bolt');

insert into public.bolt_viagens (org_id, integracao_id, order_reference, ride_price, dados_raw, updated_at)
values ('00000000-0000-0000-0000-0000003b0000', '00000000-0000-0000-0000-0000003b0e01',
        'ref-upsert-1', 12.50, '{"a": 1, "b": [1, 2]}'::jsonb, now() - interval '1 day');

create temp table linha_antes as
  select ctid::text as x, updated_at from public.bolt_viagens where order_reference = 'ref-upsert-1';

-- 1. Upsert com os mesmos dados (só updated_at novo, jsonb com outra ordem de chaves).
insert into public.bolt_viagens (org_id, integracao_id, order_reference, ride_price, dados_raw, updated_at)
values ('00000000-0000-0000-0000-0000003b0000', '00000000-0000-0000-0000-0000003b0e01',
        'ref-upsert-1', 12.5, '{"b": [1, 2], "a": 1}'::jsonb, now())
on conflict (integracao_id, order_reference) do update
  set ride_price = excluded.ride_price, dados_raw = excluded.dados_raw, updated_at = excluded.updated_at;

select is(
  (select ctid::text from public.bolt_viagens where order_reference = 'ref-upsert-1'),
  (select x from linha_antes),
  'upsert sem mudanças não reescreve a linha'
);

select is(
  (select updated_at from public.bolt_viagens where order_reference = 'ref-upsert-1'),
  (select updated_at from linha_antes),
  'updated_at fica como estava quando nada mudou'
);

-- 2. Upsert com um valor diferente: a linha é actualizada.
insert into public.bolt_viagens (org_id, integracao_id, order_reference, ride_price, dados_raw, updated_at)
values ('00000000-0000-0000-0000-0000003b0000', '00000000-0000-0000-0000-0000003b0e01',
        'ref-upsert-1', 13.00, '{"a": 1, "b": [1, 2]}'::jsonb, now())
on conflict (integracao_id, order_reference) do update
  set ride_price = excluded.ride_price, dados_raw = excluded.dados_raw, updated_at = excluded.updated_at;

select is(
  (select ride_price::numeric from public.bolt_viagens where order_reference = 'ref-upsert-1'),
  13.00::numeric,
  'upsert com valor diferente actualiza a linha'
);

select isnt(
  (select updated_at from public.bolt_viagens where order_reference = 'ref-upsert-1'),
  (select updated_at from linha_antes),
  'updated_at avança quando há mudança real'
);

-- 3. Mudança só no dados_raw também conta.
update public.bolt_viagens set dados_raw = '{"a": 2}'::jsonb where order_reference = 'ref-upsert-1';

select is(
  (select dados_raw from public.bolt_viagens where order_reference = 'ref-upsert-1'),
  '{"a": 2}'::jsonb,
  'mudança só no dados_raw é gravada'
);

-- 4. A FK para viaturas tem índice (migração 20261019130000).
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_bolt_viagens_viatura_id'),
  'bolt_viagens.viatura_id tem índice para a verificação da FK'
);

select * from finish();
rollback;
