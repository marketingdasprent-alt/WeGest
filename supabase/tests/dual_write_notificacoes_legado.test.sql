begin;
select plan(13);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000b0000', 'Org Dual Write', 'dual-write-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b0001', 'admin@dual-write.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000b0000', true);

-- get_current_org_id() (usado pela RLS de notificacoes) resolve por
-- user_org_ativa, não por user_organizacoes — necessário para o Cenário D.
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000b0000');

-- Cenário A: event_type conhecido (viatura.seguro_expirando) gera notificacoes.tipo mapeado.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000rg00b1', '00000000-0000-0000-0000-0000000b0000', 'teste.seguro', 'Seguro Teste', 'viatura.seguro_expirando', 'notificacao',
   '{"template_codigo":"teste.notif","destinatarios_recurso":"motoristas_gestao","enviar_email":false}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-000000ru00b1', '00000000-0000-0000-0000-000000rg00b1', '00000000-0000-0000-0000-0000000b0000', 'viaturas', '00000000-0000-0000-0000-000000ent00b1');

select public.execute_automation_runs();

select is(
  (select tipo from public.notificacoes where destinatario_id = '00000000-0000-0000-0000-0000000b0001' order by created_at desc limit 1),
  'viatura_seguro_expirando',
  'event_type mapeado gera notificacoes.tipo correspondente em destinatario_id — a coluna "viva" lida pela RLS e por resolver_notificacao (dupla escrita)'
);

select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-000000ru00b1'),
  1,
  'continua a criar a notificacao nova em paralelo (não substitui)'
);

-- O botão "Ver" do popup precisa de link (e viatura_id) apontando para a
-- viatura concreta — sem isto cai no fallback de candidaturas (bug real
-- reportado pelo utilizador: "Ver candidatura" num aviso de seguro).
select is(
  (select link from public.notificacoes where destinatario_id = '00000000-0000-0000-0000-0000000b0001' and tipo = 'viatura_seguro_expirando'),
  '/viaturas/00000000-0000-0000-0000-000000ent00b1',
  'viatura.seguro_expirando preenche link para a viatura concreta'
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

-- Cenário C: cobranca.gerada (I1/I2, só aviso interno — sem emitir/enviar fatura).
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000rg00b3', '00000000-0000-0000-0000-0000000b0000', 'teste.cobranca', 'Cobrança Teste', 'cobranca.gerada', 'notificacao',
   '{"template_codigo":"cobranca.gerada","destinatarios_recurso":"renting_contratos","enviar_email":false}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-000000ru00b3', '00000000-0000-0000-0000-000000rg00b3', '00000000-0000-0000-0000-0000000b0000', 'contrato_cobrancas', '00000000-0000-0000-0000-000000ent00b3');

select public.execute_automation_runs();

select is(
  (select count(*)::int from public.notifications where rule_run_id = '00000000-0000-0000-0000-000000ru00b3'),
  1,
  'cobranca.gerada notifica internamente o admin/quem tem renting_contratos'
);

select is(
  (select tipo from public.notificacoes where destinatario_id = '00000000-0000-0000-0000-0000000b0001' and tipo = 'cobranca_gerada'),
  'cobranca_gerada',
  'cobranca.gerada também escreve em notificacoes com tipo mapeado, em destinatario_id (dupla escrita)'
);

-- Cenário E: utilizador.criado e contrato_renting.renovacao_proxima —
-- adicionados depois dos 5 originais, tinham ficado de fora do mapeamento
-- (462 notificações já existiam só em `notifications`, zero visíveis no
-- sino real, até este fix).
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-000000rg00b4', '00000000-0000-0000-0000-0000000b0000', 'teste.utilizador', 'Utilizador Teste', 'utilizador.criado', 'notificacao',
   '{"template_codigo":"utilizador.criado","destinatarios_recurso":"admin_utilizadores","enviar_email":false}'::jsonb),
  ('00000000-0000-0000-0000-000000rg00b5', '00000000-0000-0000-0000-0000000b0000', 'teste.renovacao', 'Renovação Teste', 'contrato_renting.renovacao_proxima', 'notificacao',
   '{"template_codigo":"contrato_renting.renovacao_proxima","destinatarios_recurso":"renting_contratos","enviar_email":false}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-000000ru00b4', '00000000-0000-0000-0000-000000rg00b4', '00000000-0000-0000-0000-0000000b0000', 'profiles', '00000000-0000-0000-0000-000000b0001'),
  ('00000000-0000-0000-0000-000000ru00b5', '00000000-0000-0000-0000-000000rg00b5', '00000000-0000-0000-0000-0000000b0000', 'contratos_renting', '00000000-0000-0000-0000-000000ent00b5');

select public.execute_automation_runs();

select is(
  (select tipo || ' -> ' || link from public.notificacoes where destinatario_id = '00000000-0000-0000-0000-0000000b0001' and tipo = 'utilizador_criado'),
  'utilizador_criado -> /admin/utilizadores',
  'utilizador.criado escreve em notificacoes com link genérico para a página de utilizadores'
);

select is(
  (select tipo || ' -> ' || link from public.notificacoes where destinatario_id = '00000000-0000-0000-0000-0000000b0001' and tipo = 'contrato_renting_renovacao_proxima'),
  'contrato_renting_renovacao_proxima -> /renting/contratos/00000000-0000-0000-0000-000000ent00b5',
  'contrato_renting.renovacao_proxima escreve em notificacoes com link para o contrato concreto'
);

-- Cenário D: visibilidade real via RLS — exatamente o que useNotificacoes.ts lê
-- (select('*').eq('resolvida', false), sem qualquer filtro por destinatário no
-- cliente; toda a restrição vem da policy "ver notificacoes do meu cargo").
-- Sem um ramo de RLS para estes tipos, as linhas acima existem na tabela mas
-- nunca chegam ao sino/popup real de nenhum utilizador.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b0001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000b0001","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.notificacoes where resolvida = false and tipo = 'cobranca_gerada'),
  1,
  'o destinatário real vê a notificação de cobranca_gerada através da RLS (o que o sino/popup realmente lê)'
);

select is(
  (select count(*)::int from public.notificacoes where resolvida = false and tipo = 'viatura_seguro_expirando'),
  1,
  'o destinatário real vê a notificação de viatura_seguro_expirando através da RLS'
);

select is(
  (select count(*)::int from public.notificacoes where resolvida = false and tipo = 'utilizador_criado'),
  1,
  'o destinatário real vê a notificação de utilizador_criado através da RLS'
);

select is(
  (select count(*)::int from public.notificacoes where resolvida = false and tipo = 'contrato_renting_renovacao_proxima'),
  1,
  'o destinatário real vê a notificação de contrato_renting_renovacao_proxima através da RLS'
);

reset role;

select * from finish();
rollback;
