-- ============================================================
-- Motor de Automação — process_domain_events() (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre o Rule Engine: casar domain_events não processados contra
-- automation_rules ativas (mesma org+event_type), avaliar condicoes
-- (DSL simples: array de {campo,operador,valor}, "=" / "!="), respeitar
-- cooldown_minutos, e criar (ou registar porque não) automation_runs —
-- marcando sempre o evento como processado no final.
-- ============================================================

begin;
select plan(12);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org A', 'automacao-rule-engine-a');

-- Cenário A: regra sem condições — qualquer evento do tipo certo casa.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo) values
  ('00000000-0000-0000-0000-000000rga001', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_simples', 'Regra Simples', 'teste.evento.a', 'notificacao');

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by) values
  ('00000000-0000-0000-0000-000000ev1e01', '00000000-0000-0000-0000-0000000a0000', 'teste.evento.a', 'viaturas', '00000000-0000-0000-0000-000000ent0010', 'manual');

select public.process_domain_events();

-- 1. O evento fica marcado como processado.
select ok(
  (select processed_at is not null from public.domain_events where id = '00000000-0000-0000-0000-000000ev1e01'),
  'evento sem condições a bloquear fica marcado como processado'
);

-- 2. Cria-se exatamente um automation_run ligado a este evento.
select is(
  (select count(*)::int from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-000000ev1e01'),
  1,
  'evento que casa com uma regra ativa cria um automation_run'
);

-- 3. O run herda entity_table/entity_id do evento.
select is(
  (select entity_id from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-000000ev1e01'),
  '00000000-0000-0000-0000-000000ent0010'::uuid,
  'o automation_run herda entity_id do domain_event que o originou'
);

-- Cenário B: regra com condição — só o payload certo casa.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, condicoes) values
  ('00000000-0000-0000-0000-000000rgb001', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_condicao', 'Regra Condição', 'teste.evento.b', 'notificacao', '[{"campo":"estado","operador":"=","valor":"critico"}]'::jsonb);

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, payload, emitted_by) values
  ('00000000-0000-0000-0000-000000ev2e01', '00000000-0000-0000-0000-0000000a0000', 'teste.evento.b', 'viaturas', '00000000-0000-0000-0000-000000ent0020', '{"estado":"critico"}'::jsonb, 'manual'),
  ('00000000-0000-0000-0000-000000ev3e01', '00000000-0000-0000-0000-0000000a0000', 'teste.evento.b', 'viaturas', '00000000-0000-0000-0000-000000ent0021', '{"estado":"normal"}'::jsonb, 'manual');

select public.process_domain_events();

-- 4. payload que satisfaz a condição cria um run.
select is(
  (select count(*)::int from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-000000ev2e01'),
  1,
  'payload que satisfaz a condição cria um automation_run'
);

-- 5. payload que NÃO satisfaz a condição não cria run.
select is(
  (select count(*)::int from public.automation_runs where trigger_event_id = '00000000-0000-0000-0000-000000ev3e01'),
  0,
  'payload que não satisfaz a condição não cria automation_run'
);

-- 6. ...mas fica registado em automation_logs porquê.
select is(
  (select count(*)::int from public.automation_logs where rule_id = '00000000-0000-0000-0000-000000rgb001' and evento = 'condicao_nao_satisfeita'),
  1,
  'condição não satisfeita fica registada em automation_logs'
);

-- 7. ...e o evento é marcado como processado na mesma.
select ok(
  (select processed_at is not null from public.domain_events where id = '00000000-0000-0000-0000-000000ev3e01'),
  'evento cuja condição falhou também fica marcado como processado'
);

-- Cenário C: cooldown — segundo evento da mesma entidade dentro da janela não repete.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, cooldown_minutos) values
  ('00000000-0000-0000-0000-000000rgc001', '00000000-0000-0000-0000-0000000a0000', 'teste.regra_cooldown', 'Regra Cooldown', 'teste.evento.c', 'notificacao', 60);

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by) values
  ('00000000-0000-0000-0000-000000ev4e01', '00000000-0000-0000-0000-0000000a0000', 'teste.evento.c', 'viaturas', '00000000-0000-0000-0000-000000ent0030', 'manual');

select public.process_domain_events();

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by) values
  ('00000000-0000-0000-0000-000000ev5e01', '00000000-0000-0000-0000-0000000a0000', 'teste.evento.c', 'viaturas', '00000000-0000-0000-0000-000000ent0030', 'manual');

select public.process_domain_events();

-- 8. Só existe um automation_run para esta regra+entidade (o segundo foi suprimido).
select is(
  (select count(*)::int from public.automation_runs where rule_id = '00000000-0000-0000-0000-000000rgc001' and entity_id = '00000000-0000-0000-0000-000000ent0030'),
  1,
  'cooldown ativo impede um segundo run para a mesma regra+entidade dentro da janela'
);

-- 9. O segundo evento fica registado como ignorado por cooldown.
select is(
  (select count(*)::int from public.automation_logs where rule_id = '00000000-0000-0000-0000-000000rgc001' and evento = 'ignorada_cooldown'),
  1,
  'a segunda ocorrência dentro do cooldown fica registada em automation_logs'
);

-- 10. ...e ainda assim fica marcado como processado.
select ok(
  (select processed_at is not null from public.domain_events where id = '00000000-0000-0000-0000-000000ev5e01'),
  'evento suprimido por cooldown também fica marcado como processado'
);

-- Cenário D: já existe um run ativo para a mesma regra+entidade (inserido à
-- mão, fora do Rule Engine) — process_domain_events() não deve rebentar
-- nem duplicar, só engolir a colisão e seguir em frente.
insert into public.automation_runs (rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-000000rga001', '00000000-0000-0000-0000-0000000a0000', 'viaturas', '00000000-0000-0000-0000-000000ent0040');

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by) values
  ('00000000-0000-0000-0000-000000ev6e01', '00000000-0000-0000-0000-0000000a0000', 'teste.evento.a', 'viaturas', '00000000-0000-0000-0000-000000ent0040', 'manual');

select public.process_domain_events();

-- 11. Continua a existir só um run ativo para esta regra+entidade (sem duplicar).
select is(
  (select count(*)::int from public.automation_runs where rule_id = '00000000-0000-0000-0000-000000rga001' and entity_id = '00000000-0000-0000-0000-000000ent0040'),
  1,
  'uma colisão com um run já ativo não duplica — engole o unique_violation'
);

-- 12. ...e o evento ainda assim fica marcado como processado.
select ok(
  (select processed_at is not null from public.domain_events where id = '00000000-0000-0000-0000-000000ev6e01'),
  'evento que colide com um run já ativo também fica marcado como processado'
);

select * from finish();
rollback;
