-- ============================================================
-- Motor de Automação — seed_automacao_defaults() (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre: as 4 regras por-omissão (as que emit_expiry_events() já
-- alimenta) são criadas para uma org, a chamada é idempotente, e uma
-- organização nova recebe-as automaticamente via trigger.
-- ============================================================

begin;
select plan(4);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org Seed A', 'seed-automacao-a');

select public.seed_automacao_defaults('00000000-0000-0000-0000-0000000a0000');

-- 1. As 4 regras por-omissão foram criadas.
select is(
  (select count(*)::int from public.automation_rules where org_id = '00000000-0000-0000-0000-0000000a0000'),
  4,
  'seed_automacao_defaults() cria as 4 regras por-omissão'
);

-- 2. Os códigos são exatamente os esperados.
select is(
  (select array_agg(codigo order by codigo) from public.automation_rules where org_id = '00000000-0000-0000-0000-0000000a0000'),
  array['motorista.carta_expirando', 'motorista.licenca_tvde_expirando', 'viatura.inspecao_expirando', 'viatura.seguro_expirando'],
  'os códigos das regras por-omissão são os esperados'
);

-- 3. Chamar outra vez não duplica (ON CONFLICT DO NOTHING).
select public.seed_automacao_defaults('00000000-0000-0000-0000-0000000a0000');

select is(
  (select count(*)::int from public.automation_rules where org_id = '00000000-0000-0000-0000-0000000a0000'),
  4,
  'chamar seed_automacao_defaults() outra vez não duplica as regras'
);

-- 4. Uma nova organização recebe as regras automaticamente via trigger.
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000b0000', 'Org Seed B', 'seed-automacao-b');

select is(
  (select count(*)::int from public.automation_rules where org_id = '00000000-0000-0000-0000-0000000b0000'),
  4,
  'uma organização nova recebe as 4 regras automaticamente (trigger em organizacoes)'
);

select * from finish();
rollback;
