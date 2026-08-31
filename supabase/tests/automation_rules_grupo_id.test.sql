begin;
select plan(4);

-- ============================================================================
-- automation_rules ganha grupo_id — a mesma automação, várias acções
-- ============================================================================

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000110000', 'Org Grupo Id', 'grupo-id-a');

-- 1. A coluna existe, não é nullable.
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'automation_rules'
      and column_name = 'grupo_id' and is_nullable = 'NO'
  ),
  'grupo_id existe e é obrigatória'
);

-- 2. O índice existe.
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'automation_rules'
      and indexname = 'idx_automation_rules_grupo'
  ),
  'há um índice em grupo_id'
);

-- 3. Uma regra nova, sem grupo_id explícito, ganha um por omissão.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config)
values (
  '00000000-0000-0000-0000-000000120001', '00000000-0000-0000-0000-000000110000',
  'zz.teste.pgtap.grupo1', 'teste grupo 1', 'viatura.seguro_expirando', 'notificacao',
  jsonb_build_object('template_codigo', 'teste', 'titulo', 'Teste', 'destinatarios_cargo_ids', jsonb_build_array())
);

select isnt(
  (select grupo_id from public.automation_rules where id = '00000000-0000-0000-0000-000000120001'),
  null,
  'uma regra nova ganha grupo_id por omissão'
);

-- 4. Duas regras inseridas sem grupo_id explícito ganham grupos DIFERENTES
--    (o default gera um novo uuid por linha, não um valor partilhado).
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config)
values (
  '00000000-0000-0000-0000-000000120002', '00000000-0000-0000-0000-000000110000',
  'zz.teste.pgtap.grupo2', 'teste grupo 2', 'viatura.seguro_expirando', 'notificacao',
  jsonb_build_object('template_codigo', 'teste', 'titulo', 'Teste', 'destinatarios_cargo_ids', jsonb_build_array())
);

select isnt(
  (select grupo_id from public.automation_rules where id = '00000000-0000-0000-0000-000000120001'),
  (select grupo_id from public.automation_rules where id = '00000000-0000-0000-0000-000000120002'),
  'duas regras sem grupo_id explícito não partilham grupo por acidente'
);

select * from finish();
rollback;
