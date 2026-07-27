begin;
select plan(4);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000b0000', 'Org Dual Write', 'dual-write-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b0001', 'admin@dual-write.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000b0000', true);

-- Cenário A: event_type conhecido (viatura.seguro_expirando) gera notificacoes.tipo mapeado.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000rg00b1', '00000000-0000-0000-0000-0000000b0000', 'teste.seguro', 'Seguro Teste', 'viatura.seguro_expirando', 'notificacao',
   '{"template_codigo":"teste.notif","destinatarios_recurso":"motoristas_gestao","enviar_email":false}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-000000ru00b1', '00000000-0000-0000-0000-000000rg00b1', '00000000-0000-0000-0000-0000000b0000', 'viaturas', '00000000-0000-0000-0000-000000ent00b1');

select public.execute_automation_runs();

select is(
  (select tipo from public.notificacoes where destinatario_user_id = '00000000-0000-0000-0000-0000000b0001' order by created_at desc limit 1),
  'viatura_seguro_expirando',
  'event_type mapeado gera notificacoes.tipo correspondente (dupla escrita)'
);

select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-000000ru00b1'),
  1,
  'continua a criar a notificacao nova em paralelo (não substitui)'
);

-- Cenário B: event_type desconhecido não gera notificacoes (whitelist), mas não falha.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000rg00b2', '00000000-0000-0000-0000-0000000b0000', 'teste.desconhecido', 'Evento Desconhecido', 'teste.evento_desconhecido', 'notificacao',
   '{"template_codigo":"teste.notif","destinatarios_recurso":"motoristas_gestao","enviar_email":false}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id) values
  ('00000000-0000-0000-0000-000000ru00b2', '00000000-0000-0000-0000-000000rg00b2', '00000000-0000-0000-0000-0000000b0000');

select public.execute_automation_runs();

select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-000000ru00b2'),
  'completed',
  'event_type desconhecido não gera notificacoes, mas o run conclui normalmente'
);

select is(
  (select count(*)::int from public.notificacoes where org_id = '00000000-0000-0000-0000-0000000b0000' and tipo <> 'viatura_seguro_expirando'),
  0,
  'nenhuma linha extra em notificacoes para o event_type fora da whitelist'
);

select * from finish();
rollback;
