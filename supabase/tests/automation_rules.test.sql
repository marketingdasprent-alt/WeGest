-- ============================================================
-- Motor de Automação — domain_events + automation_rules (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- O isolamento ESTRUTURAL (META: RLS ativa + policy rls_org_isolation)
-- já é coberto genericamente por rls_org_isolation.test.sql, que descobre
-- estas tabelas automaticamente por terem org_id. Este ficheiro cobre
-- COMPORTAMENTO: isolamento real com 2 orgs, e que a policy de permissão
-- (has_permission/is_current_user_admin) bloqueia quem não tem o recurso
-- 'automacoes', mesmo dentro da própria organização.
-- ============================================================

begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org A', 'automacao-rules-a'),
  ('00000000-0000-0000-0000-0000000b0000', 'Org B', 'automacao-rules-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0001', 'a@automacao-rules.pt'),
  ('00000000-0000-0000-0000-0000000b0001', 'b@automacao-rules.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0000'),
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000b0000');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0000', true),
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000b0000', false);

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-0000004c1e01', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_a', 'Regra A', 'teste.evento', 'notificacao', '{"template_codigo":"teste.template","titulo":"Titulo de Teste"}'::jsonb),
  ('00000000-0000-0000-0000-0000004c1e02', '00000000-0000-0000-0000-0000000b0000', 'teste.regra_b', 'Regra B', 'teste.evento', 'notificacao', '{"template_codigo":"teste.template","titulo":"Titulo de Teste"}'::jsonb);

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by) values
  ('00000000-0000-0000-0000-000000e81e01', '00000000-0000-0000-0000-0000000a0000', 'teste.evento', 'viaturas', '00000000-0000-0000-0000-000000000001', 'manual'),
  ('00000000-0000-0000-0000-000000e81e02', '00000000-0000-0000-0000-0000000b0000', 'teste.evento', 'viaturas', '00000000-0000-0000-0000-000000000002', 'manual');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a0001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}', true);

-- Estas duas asserções contavam regras: «o user A vê exactamente 1». Deixou de
-- ser verdade e não por regressão — criar uma organização passou a semear
-- automaticamente as regras por omissão (trigger em `organizacoes`), pelo que
-- a Org A tem as 19 semeadas mais a 1 deste teste.
--
-- Contar era a forma frágil de perguntar o que interessa. O que este teste
-- existe para garantir é ISOLAMENTO: nada da Org B chega ao user A. Passou a
-- ser essa a pergunta, e a resposta não muda quando o seed crescer.
select is(
  (select count(*)::int from public.automation_rules
     where org_id = '00000000-0000-0000-0000-0000000b0000'),
  0,
  'user A (admin da Org A) não vê nenhuma regra da Org B'
);

select is(
  (select count(*)::int from public.automation_rules
     where codigo = 'teste.regra_a'
       and org_id = '00000000-0000-0000-0000-0000000a0000'),
  1,
  'a regra da própria org é visível ao user A'
);

select is(
  (select count(*)::int from public.domain_events where event_type = 'teste.evento'),
  1,
  'user A só vê o evento da sua própria org'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b0001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b0001","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.automation_rules),
  0,
  'user B (sem ser admin, sem o recurso automacoes) não vê nenhuma regra'
);

select is(
  (select count(*)::int from public.domain_events where event_type = 'teste.evento'),
  0,
  'user B (sem ser admin, sem o recurso automacoes) não vê nenhum evento'
);

reset role;

select is(
  (select count(*)::int from public.recursos where nome = 'automacoes'),
  1,
  'o recurso automacoes existe no catálogo global para poder ser concedido a cargos'
);

select * from finish();
rollback;
