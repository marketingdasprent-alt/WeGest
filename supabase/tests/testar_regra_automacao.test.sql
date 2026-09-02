-- ============================================================
-- testar_regra_automacao() (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Desde 20260904100000 o "Testar" é um DISPARO REAL: cria um
-- `automation_runs` com a definição actual congelada e chama o executor de
-- produção. Não há aqui lógica própria de destinatários — o que se testa é
-- que o run nasce bem e que o resultado devolvido descreve o que aconteceu.
--
-- Por isso as asserções são sobre efeitos observáveis (o run concluiu, a
-- fila ganhou linha, quem recebeu foi quem estava escolhido), não sobre um
-- caminho paralelo.
-- ============================================================

begin;
select plan(13);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000080000', 'Org Testar Regra', 'testar-regra-g'),
  ('00000000-0000-0000-0000-000000080ffe', 'Org Alheia', 'testar-regra-alheia');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000080a01', 'admin@testar-regra-g.pt'),
  ('00000000-0000-0000-0000-000000080a02', 'sem-permissao@testar-regra-g.pt'),
  ('00000000-0000-0000-0000-000000080a03', 'escolhido@testar-regra-g.pt');

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-0000000c6001', 'Cargo Testar', '00000000-0000-0000-0000-000000080000');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-000000080a01', '00000000-0000-0000-0000-000000080000', true, null),
  ('00000000-0000-0000-0000-000000080a02', '00000000-0000-0000-0000-000000080000', false, null),
  ('00000000-0000-0000-0000-000000080a03', '00000000-0000-0000-0000-000000080000', false, '00000000-0000-0000-0000-0000000c6001');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-000000080a01', '00000000-0000-0000-0000-000000080000'),
  ('00000000-0000-0000-0000-000000080a02', '00000000-0000-0000-0000-000000080000'),
  ('00000000-0000-0000-0000-000000080a03', '00000000-0000-0000-0000-000000080000');

-- Regra de notificação, sem execução anterior. `enviar_email` fica na config
-- porque `fn_notifications_so_quando_ha_email` cancela o insert sem ele —
-- mesma razão detalhada em execute_automation_runs.test.sql.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values (
  '00000000-0000-0000-0000-000000080b01', '00000000-0000-0000-0000-000000080000',
  'zz.teste.pgtap.testar.notif', 'Notificação de teste', 'viatura.seguro_expirando', 'notificacao',
  jsonb_build_object('template_codigo', 'zz-teste', 'titulo', 'Seguro a expirar',
                     'destinatarios_cargo_ids', jsonb_build_array(), 'enviar_email', true)
);

-- Acção interna — só para o guarda de acao_tipo.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values (
  '00000000-0000-0000-0000-000000080b02', '00000000-0000-0000-0000-000000080000',
  'zz.teste.pgtap.testar.interna', 'Acção interna de teste', 'assistencia_ticket.aberto_demasiado_tempo', 'automacao_interna',
  jsonb_build_object('accao', 'ticket.alterar_estado', 'valor', 'resolvido')
);

-- Regra de outra organização — só para o teste de isolamento.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values (
  '00000000-0000-0000-0000-000000080b03', '00000000-0000-0000-0000-000000080ffe',
  'zz.teste.pgtap.testar.alheia', 'Regra de outra org', 'viatura.seguro_expirando', 'notificacao',
  jsonb_build_object('template_codigo', 'zz-teste', 'titulo', 'Alheia', 'destinatarios_cargo_ids', jsonb_build_array())
);

-- Regra de email, com um cargo escolhido: é este o destinatário esperado.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values (
  '00000000-0000-0000-0000-000000080b04', '00000000-0000-0000-0000-000000080000',
  'zz.teste.pgtap.testar.email', 'Email de teste', 'viatura.seguro_expirando', 'email',
  jsonb_build_object('template_codigo', 'zz-teste-email', 'titulo', 'Seguro a expirar (email)',
                     'destinatarios_estrategia', 'cargo',
                     'destinatarios_cargo_ids', jsonb_build_array('00000000-0000-0000-0000-0000000c6001'))
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a01","role":"authenticated"}', true);

-- 1. Sem execução anterior não há payload de onde partir.
select throws_ok(
  $$ select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b01') $$,
  'P0001',
  'Esta automação ainda não correu — não há dados para testar.',
  'sem automation_runs anterior, o teste é recusado'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a02', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a02","role":"authenticated"}', true);

-- 2. Sem permissão não se testa.
select throws_ok(
  $$ select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b01') $$,
  'P0001',
  'Sem permissão para testar automações.',
  'utilizador sem admin/can_edit(automacoes) não pode testar'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a01","role":"authenticated"}', true);

-- 3. Regra de outra organização não é visível.
select throws_ok(
  $$ select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b03') $$,
  'P0001',
  'Regra não encontrada.',
  'regra de outra organização não é visível para testar'
);

-- 4. Acção interna não passa por este caminho.
select throws_ok(
  $$ select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b02') $$,
  'P0001',
  'Só é possível testar acções de notificação ou email.',
  'acção interna não pode ser testada por este caminho'
);

reset role;

-- Dá à regra de email um disparo anterior, de onde o teste tira o payload.
insert into public.automation_runs (id, org_id, rule_id, entity_table, entity_id, payload, status, rule_snapshot) values (
  '00000000-0000-0000-0000-000000080c02', '00000000-0000-0000-0000-000000080000',
  '00000000-0000-0000-0000-000000080b04', 'viaturas',
  '00000000-0000-0000-0000-000000080d01', jsonb_build_object('matricula', 'ZZ-00-ZZ'), 'completed',
  -- A mesma função que o motor usa: `automation_runs_snapshot_coerente` exige
  -- schema_version + definition_hash + regra, e montá-la à mão não passa.
  public.automation_rule_snapshot((select r from public.automation_rules r where r.id = '00000000-0000-0000-0000-000000080b04'))
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a01","role":"authenticated"}', true);

-- 5. Testar devolve o id do run NOVO que criou.
select isnt(
  (select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b04')->>'run_id'),
  null,
  'testar cria um run e devolve o id dele'
);

reset role;

-- 6. Esse run é um run a sério — e concluiu.
select is(
  (select count(*)::int from public.automation_runs
    where rule_id = '00000000-0000-0000-0000-000000080b04'
      and id <> '00000000-0000-0000-0000-000000080c02'
      and status = 'completed'),
  1,
  'o teste cria um run verdadeiro, que o executor conclui'
);

-- 7. Quem recebeu foi quem está no cargo escolhido.
select is(
  (select count(*)::int from public.notification_queue q
     join public.notifications n on n.id = q.notification_id
     join public.automation_runs r on r.id = n.rule_run_id
    where r.rule_id = '00000000-0000-0000-0000-000000080b04'
      and r.id <> '00000000-0000-0000-0000-000000080c02'
      and q.destinatario = 'escolhido@testar-regra-g.pt'),
  1,
  'o email do teste vai para quem está no cargo escolhido'
);

-- 8. E não para o admin, que não pertence ao cargo — uma acção de email não
--    arrasta os administradores (20260904093000).
select is(
  (select count(*)::int from public.notification_queue q
     join public.notifications n on n.id = q.notification_id
     join public.automation_runs r on r.id = n.rule_run_id
    where r.rule_id = '00000000-0000-0000-0000-000000080b04'
      and r.id <> '00000000-0000-0000-0000-000000080c02'
      and q.destinatario = 'admin@testar-regra-g.pt'),
  0,
  'o teste não manda para o admin quando ele não foi escolhido'
);

-- Rebobina o cooldown para poder voltar a testar dentro do mesmo ficheiro.
update public.automacao_regra_teste_cooldown
set ultimo_teste_em = now() - interval '1 minute'
where rule_id = '00000000-0000-0000-0000-000000080b04';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a01","role":"authenticated"}', true);

-- 9. O resultado descreve o que aconteceu: um email na fila.
select is(
  (select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b04')->>'emails_enfileirados'),
  '1',
  'o resultado diz quantos emails ficaram em fila'
);

-- 10. Repetir de imediato é bloqueado pelo cooldown.
select throws_ok(
  $$ select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b04') $$,
  'P0001',
  null,
  'repetir o teste de imediato é bloqueado pelo cooldown de 30s'
);

reset role;

update public.automacao_regra_teste_cooldown
set ultimo_teste_em = now() - interval '1 minute'
where rule_id = '00000000-0000-0000-0000-000000080b04';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000080a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000080a01","role":"authenticated"}', true);

-- 11. Passado o cooldown, volta a funcionar.
select isnt(
  (select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b04')->>'run_id'),
  null,
  'passado o cooldown, o teste volta a funcionar'
);

-- 12. A lista de destinatários vem das notificações criadas, não de uma
--     previsão à parte — e traz o endereço de quem recebeu.
update public.automacao_regra_teste_cooldown
set ultimo_teste_em = now() - interval '1 minute'
where rule_id = '00000000-0000-0000-0000-000000080b04';

select ok(
  (select public.testar_regra_automacao('00000000-0000-0000-0000-000000080b04')->'destinatarios'
     @> jsonb_build_array(jsonb_build_object('email', 'escolhido@testar-regra-g.pt', 'nome', 'escolhido@testar-regra-g.pt'))),
  'destinatarios traz quem recebeu de facto'
);

reset role;

-- 13. Cada teste é uma execução: a regra passou a ter vários runs.
select cmp_ok(
  (select count(*)::int from public.automation_runs where rule_id = '00000000-0000-0000-0000-000000080b04'),
  '>',
  1,
  'cada teste conta como uma execução da automação'
);

select * from finish();
rollback;
