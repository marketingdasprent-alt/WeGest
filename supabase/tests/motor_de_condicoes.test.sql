-- ============================================================
-- Motor de condições (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre a Fase 4. A garantia sob teste:
--
--   uma automação só gera um run quando TODAS as suas condições são válidas,
--   compreendidas pelo motor e satisfeitas. O que o motor não entende nunca
--   autoriza uma execução.
--
-- ── O BUG QUE ISTO FECHA ────────────────────────────────────────────────────
--
-- O avaliador antigo tinha um ramo para `=`, outro para `!=`, e nenhum ELSE.
-- Um operador fora desses dois não entrava em ramo nenhum, a variável ficava
-- no `true` inicial, e a condição passava sempre. Um filtro que parece
-- funcionar e não filtra nada.
--
-- E `!=` sobre um campo INEXISTENTE dava true, porque comparava NULL com um
-- texto e concluía «são diferentes». Uma regra escrita para «só quando o
-- estado não é rascunho» disparava em todos os eventos que nem têm estado.
--
-- ── PORQUE UM event_type INVENTADO ──────────────────────────────────────────
--
-- Criar uma organização dispara `trg_organizacoes_seed_automacao`, que semeia
-- as regras por omissão. Com um event_type real, cada evento casaria também
-- com a regra semeada e nasceriam runs a mais. `teste.f4_cond` é só destas
-- regras. Efeito secundário: `v_tipo_legado` fica NULL, portanto não há
-- dual-write nem supressão por aviso em aberto a interferir.
--
-- ── A TABELA DE VERDADE NUMA ASSERÇÃO SÓ ────────────────────────────────────
--
-- Os 29 casos correm numa asserção que, ao falhar, nomeia exactamente quais
-- falharam e com que valores. Vinte e nove asserções separadas dariam o mesmo
-- veredicto com mais ruído e menos contexto — aqui a saída do pgTAP diz «o
-- caso X deu true e devia dar false» em vez de «o teste 14 falhou».
--
-- As três propriedades que dão nome à fase têm asserção própria, para
-- aparecerem pelo nome no gate.
-- ============================================================

begin;
select plan(23);

-- ════════════════════════════════════════════════════════════
-- O registry é fechado
-- ════════════════════════════════════════════════════════════
-- O efeito da lista fechada, não a lista. Se um operador for acrescentado ao
-- registry sem o ramo correspondente no avaliador, isto continua verde e a
-- tabela de verdade é que acusa — o que é a ordem certa: primeiro sabe-se que
-- só estes dois são aceites, depois que fazem o que dizem.
select is(
  (select string_agg(op, ',' order by op)
     from (values ('='), ('!='), ('>'), ('<'), ('like'), ('in'), ('==')) t(op)
    where public.fn_condicao_invalida(
            jsonb_build_object('campo', 'x', 'operador', op, 'valor', 'y')) is null),
  '!=,=',
  'de sete operadores plausíveis, só = e != são aceites'
);

-- ════════════════════════════════════════════════════════════
-- Tabela de verdade
-- ════════════════════════════════════════════════════════════
select is(
  (select string_agg(
            caso || ' → obteve ' || obtido::text || ', esperava ' || esperado::text,
            E'\n' order by caso)
     from (values
       ('sem condições casa',                     true,  public.fn_avaliar_condicoes('[]'::jsonb, '{"a":1}')),
       ('= iguais, string',                       true,  public.fn_avaliar_condicoes('[{"campo":"s","operador":"=","valor":"a"}]', '{"s":"a"}')),
       ('= diferentes, string',                   false, public.fn_avaliar_condicoes('[{"campo":"s","operador":"=","valor":"b"}]', '{"s":"a"}')),
       ('!= diferentes',                          true,  public.fn_avaliar_condicoes('[{"campo":"s","operador":"!=","valor":"b"}]', '{"s":"a"}')),
       ('!= iguais',                              false, public.fn_avaliar_condicoes('[{"campo":"s","operador":"!=","valor":"a"}]', '{"s":"a"}')),
       ('ausente com =',                          false, public.fn_avaliar_condicoes('[{"campo":"x","operador":"=","valor":"a"}]', '{"s":"a"}')),
       ('ausente com !=',                         false, public.fn_avaliar_condicoes('[{"campo":"x","operador":"!=","valor":"a"}]', '{"s":"a"}')),
       ('payload vazio com =',                    false, public.fn_avaliar_condicoes('[{"campo":"s","operador":"=","valor":"a"}]', '{}')),
       ('operador desconhecido',                  false, public.fn_avaliar_condicoes('[{"campo":"s","operador":"banana","valor":"a"}]', '{"s":"a"}')),
       ('operador vazio',                         false, public.fn_avaliar_condicoes('[{"campo":"s","operador":"","valor":"a"}]', '{"s":"a"}')),
       ('operador não-string',                    false, public.fn_avaliar_condicoes('[{"campo":"s","operador":5,"valor":"a"}]', '{"s":"a"}')),
       ('campo só com espaços',                   false, public.fn_avaliar_condicoes('[{"campo":"  ","operador":"=","valor":"a"}]', '{"s":"a"}')),
       ('campo não-string',                       false, public.fn_avaliar_condicoes('[{"campo":7,"operador":"=","valor":"a"}]', '{"s":"a"}')),
       ('número 10 = 10',                         true,  public.fn_avaliar_condicoes('[{"campo":"n","operador":"=","valor":10}]', '{"n":10}')),
       ('número 10 = 10.0',                       true,  public.fn_avaliar_condicoes('[{"campo":"n","operador":"=","valor":10.0}]', '{"n":10}')),
       ('número 1.5 = 1.50',                      true,  public.fn_avaliar_condicoes('[{"campo":"n","operador":"=","valor":1.50}]', '{"n":1.5}')),
       ('número 0 = -0',                          true,  public.fn_avaliar_condicoes('[{"campo":"n","operador":"=","valor":-0}]', '{"n":0}')),
       ('número -1 = -1',                         true,  public.fn_avaliar_condicoes('[{"campo":"n","operador":"=","valor":-1}]', '{"n":-1}')),
       ('número 10 vs string "10"',               false, public.fn_avaliar_condicoes('[{"campo":"n","operador":"=","valor":"10"}]', '{"n":10}')),
       ('número 10 vs string "10" com !=',        false, public.fn_avaliar_condicoes('[{"campo":"n","operador":"!=","valor":"10"}]', '{"n":10}')),
       ('boolean true',                           true,  public.fn_avaliar_condicoes('[{"campo":"b","operador":"=","valor":true}]', '{"b":true}')),
       ('boolean false',                          true,  public.fn_avaliar_condicoes('[{"campo":"b","operador":"=","valor":false}]', '{"b":false}')),
       ('boolean vs string "false"',              false, public.fn_avaliar_condicoes('[{"campo":"b","operador":"=","valor":"false"}]', '{"b":false}')),
       ('null explícito = null explícito',        true,  public.fn_avaliar_condicoes('[{"campo":"z","operador":"=","valor":null}]', '{"z":null}')),
       ('null explícito vs campo ausente',        false, public.fn_avaliar_condicoes('[{"campo":"z","operador":"=","valor":null}]', '{"s":"a"}')),
       ('string "a" contra "A" é sensível',       false, public.fn_avaliar_condicoes('[{"campo":"s","operador":"=","valor":"a"}]', '{"s":"A"}')),
       ('duas verdadeiras',                       true,  public.fn_avaliar_condicoes('[{"campo":"s","operador":"=","valor":"a"},{"campo":"n","operador":"=","valor":1}]', '{"s":"a","n":1}')),
       ('uma de duas falsa',                      false, public.fn_avaliar_condicoes('[{"campo":"s","operador":"=","valor":"a"},{"campo":"n","operador":"=","valor":2}]', '{"s":"a","n":1}')),
       ('condição com chave a mais',              false, public.fn_avaliar_condicoes('[{"campo":"s","operador":"=","valor":"a","tipo":"string"}]', '{"s":"a"}')),
       ('condição com chave a menos',             false, public.fn_avaliar_condicoes('[{"campo":"s","operador":"="}]', '{"s":"a"}')),
       ('valor objecto',                          false, public.fn_avaliar_condicoes('[{"campo":"s","operador":"=","valor":{"x":1}}]', '{"s":"a"}')),
       ('valor array',                            false, public.fn_avaliar_condicoes('[{"campo":"s","operador":"=","valor":["a"]}]', '{"s":"a"}')),
       ('condição não-objecto',                   false, public.fn_avaliar_condicoes('["banana"]'::jsonb, '{"s":"a"}')),
       ('condicoes objecto em vez de array',      false, public.fn_avaliar_condicoes('{}'::jsonb, '{"s":"a"}')),
       ('condicoes nulo',                         false, public.fn_avaliar_condicoes(null, '{"s":"a"}'))
     ) as t(caso, esperado, obtido)
    where obtido is distinct from esperado),
  null::text,
  'a tabela de verdade das condições passa em todos os casos'
);

-- ── As três propriedades que dão nome à fase, pelo nome ──────
select is(
  public.fn_avaliar_condicoes('[{"campo":"ausente","operador":"=","valor":"x"}]', '{"outro":"y"}'),
  false,
  'campo ausente com = não satisfaz'
);

-- Este é o obrigatório: antes desta fase dava TRUE.
select is(
  public.fn_avaliar_condicoes('[{"campo":"ausente","operador":"!=","valor":"x"}]', '{"outro":"y"}'),
  false,
  'campo ausente com != NÃO satisfaz — um campo que não existe não é «diferente»'
);

select is(
  public.fn_avaliar_condicoes('[{"campo":"s","operador":"~~","valor":"a"}]', '{"s":"a"}'),
  false,
  'um operador que o motor não conhece nunca casa — antes casava sempre'
);

-- `ok(x like ...)` e não o `like()` do pgTAP: o nome colide com o operador
-- LIKE do SQL e a resolução depende da versão da extensão.
select ok(
  public.fn_condicoes_invalidas('[{"campo":"s","operador":"~~","valor":"a"}]') like '%operador "~~" não é suportado%',
  'a invalidez é explicada, não só sinalizada'
);

select is(
  public.fn_condicoes_invalidas('[{"campo":"s","operador":"=","valor":"a"}]'),
  null,
  'uma condição bem formada não tem nada a apontar'
);

-- ════════════════════════════════════════════════════════════
-- Validação na escrita — a UI não é fronteira de segurança
-- ════════════════════════════════════════════════════════════
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f4000', 'Org Condicoes A', 'f4-a'),
  ('00000000-0000-0000-0000-0000000f4b00', 'Org Condicoes B', 'f4-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f4001', 'admin@f4.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000f4001', '00000000-0000-0000-0000-0000000f4000');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000f4001', '00000000-0000-0000-0000-0000000f4000', true);

-- A normalização da migração deixou uma forma vazia só. As regras semeadas
-- desta organização acabaram de nascer com o default novo.
select is(
  (select count(*)::int from public.automation_rules
    where org_id = '00000000-0000-0000-0000-0000000f4000'
      and jsonb_typeof(condicoes) <> 'array'),
  0,
  'nenhuma regra nasce com condicoes fora da forma de array'
);

-- 23514 = check_violation, o ERRCODE que o validador levanta.
select throws_ok(
  $$insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config, condicoes)
    values ('00000000-0000-0000-0000-0000000f4000', 'teste.f4_mau_op', 'Operador Mau', 'teste.f4_cond', 'notificacao',
            '{"titulo":"T","template_codigo":"t"}'::jsonb,
            '[{"campo":"estado","operador":"banana","valor":"x"}]'::jsonb)$$,
  '23514',
  null,
  'escrita directa com operador inventado é recusada pelo banco'
);

select throws_ok(
  $$insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config, condicoes)
    values ('00000000-0000-0000-0000-0000000f4000', 'teste.f4_chave', 'Chave A Mais', 'teste.f4_cond', 'notificacao',
            '{"titulo":"T","template_codigo":"t"}'::jsonb,
            '[{"campo":"estado","operador":"=","valor":"x","tipo":"string"}]'::jsonb)$$,
  '23514',
  null,
  'uma chave que o motor não honra é recusada em vez de ignorada em silêncio'
);

select throws_ok(
  $$insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config, condicoes)
    values ('00000000-0000-0000-0000-0000000f4000', 'teste.f4_vazio', 'Campo Vazio', 'teste.f4_cond', 'notificacao',
            '{"titulo":"T","template_codigo":"t"}'::jsonb,
            '[{"campo":"   ","operador":"=","valor":"x"}]'::jsonb)$$,
  '23514',
  null,
  'campo vazio é recusado na escrita'
);

select throws_ok(
  $$insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config, condicoes)
    values ('00000000-0000-0000-0000-0000000f4000', 'teste.f4_obj', 'Objecto', 'teste.f4_cond', 'notificacao',
            '{"titulo":"T","template_codigo":"t"}'::jsonb,
            '{"campo":"estado"}'::jsonb)$$,
  '23514',
  null,
  'condicoes que não sejam um array são recusadas'
);

-- A regra válida do cenário de integração: só continua se o estado for 'grave'.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config, condicoes) values
  ('00000000-0000-0000-0000-00004600f401', '00000000-0000-0000-0000-0000000f4000',
   'teste.f4_valida', 'Regra Valida', 'teste.f4_cond', 'notificacao',
   '{"titulo":"T","template_codigo":"t"}'::jsonb,
   '[{"campo":"estado","operador":"=","valor":"grave"}]'::jsonb);

select throws_ok(
  $$update public.automation_rules
       set condicoes = '[{"campo":"estado","operador":">>","valor":"x"}]'::jsonb
     where id = '00000000-0000-0000-0000-00004600f401'$$,
  '23514',
  null,
  'UPDATE directo com operador inválido é recusado — não só o INSERT'
);

-- ════════════════════════════════════════════════════════════
-- Multi-tenancy: a validação nova não substitui a RLS
-- ════════════════════════════════════════════════════════════
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config, condicoes) values
  ('00000000-0000-0000-0000-00004600f4b1', '00000000-0000-0000-0000-0000000f4b00',
   'teste.f4_orgb', 'Regra Org B', 'teste.f4_cond', 'notificacao',
   '{"titulo":"T","template_codigo":"t"}'::jsonb,
   '[{"campo":"estado","operador":"=","valor":"grave"}]'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f4001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000f4001","role":"authenticated"}', true);

-- Uma condição PERFEITAMENTE válida, noutra organização. A RLS não deixa
-- passar, e não é por causa do conteúdo.
update public.automation_rules
   set condicoes = '[{"campo":"estado","operador":"=","valor":"leve"}]'::jsonb
 where id = '00000000-0000-0000-0000-00004600f4b1';

reset role;

select is(
  (select condicoes->0->>'valor' from public.automation_rules
    where id = '00000000-0000-0000-0000-00004600f4b1'),
  'grave',
  'um utilizador da org A não altera as condições de uma regra da org B, mesmo sendo válidas'
);

-- ════════════════════════════════════════════════════════════
-- Integração: condição verdadeira cria run, falsa não
-- ════════════════════════════════════════════════════════════
insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at, payload) values
  ('00000000-0000-0000-0000-00000e0f4001', '00000000-0000-0000-0000-0000000f4000',
   'teste.f4_cond', 'viaturas', '00000000-0000-0000-0000-0000870f4001', 'manual', now() - interval '5 minutes',
   '{"estado":"grave","n":10,"activo":true}'::jsonb);

select public.process_domain_events();

select is(
  (select count(*)::int from public.automation_runs
    where trigger_event_id = '00000000-0000-0000-0000-00000e0f4001'
      and rule_id = '00000000-0000-0000-0000-00004600f401'),
  1,
  'condição satisfeita cria o run'
);

-- A condição congelada tem de ser a que foi avaliada, não outra coisa.
select is(
  (select rule_snapshot->'regra'->'condicoes' from public.automation_runs
    where trigger_event_id = '00000000-0000-0000-0000-00000e0f4001'
      and rule_id = '00000000-0000-0000-0000-00004600f401'),
  '[{"campo":"estado","operador":"=","valor":"grave"}]'::jsonb,
  'o snapshot da Fase 3 guarda exactamente as condições canónicas avaliadas'
);

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at, payload) values
  ('00000000-0000-0000-0000-00000e0f4002', '00000000-0000-0000-0000-0000000f4000',
   'teste.f4_cond', 'viaturas', '00000000-0000-0000-0000-0000870f4002', 'manual', now() - interval '4 minutes',
   '{"estado":"leve"}'::jsonb);

select public.process_domain_events();

select is(
  (select count(*)::int from public.automation_runs
    where trigger_event_id = '00000000-0000-0000-0000-00000e0f4002'),
  0,
  'condição não satisfeita não cria run'
);

select is(
  (select count(*)::int from public.automation_logs
    where rule_id = '00000000-0000-0000-0000-00004600f401'
      and evento = 'condicao_nao_satisfeita'),
  1,
  'e fica registada como condição não satisfeita, não como erro'
);

-- ════════════════════════════════════════════════════════════
-- Uma regra partida não é um poison event
-- ════════════════════════════════════════════════════════════
-- A regra inválida é plantada com o validador desligado: reproduz uma regra
-- gravada ANTES desta fase, que é o único caminho pelo qual uma configuração
-- impossível pode hoje chegar ao motor. O CHECK da forma continua activo,
-- portanto só o conteúdo é que é inválido.
alter table public.automation_rules disable trigger trg_validar_condicoes;

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config, condicoes) values
  ('00000000-0000-0000-0000-00004600f402', '00000000-0000-0000-0000-0000000f4000',
   'teste.f4_partida', 'Regra Partida', 'teste.f4_cond', 'notificacao',
   '{"titulo":"T","template_codigo":"t"}'::jsonb,
   '[{"campo":"estado","operador":"aproximadamente","valor":"grave"}]'::jsonb);

alter table public.automation_rules enable trigger trg_validar_condicoes;

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at, payload) values
  ('00000000-0000-0000-0000-00000e0f4003', '00000000-0000-0000-0000-0000000f4000',
   'teste.f4_cond', 'viaturas', '00000000-0000-0000-0000-0000870f4003', 'manual', now() - interval '3 minutes',
   '{"estado":"grave"}'::jsonb);

select public.process_domain_events();

select is(
  (select count(*)::int from public.automation_runs
    where trigger_event_id = '00000000-0000-0000-0000-00000e0f4003'
      and rule_id = '00000000-0000-0000-0000-00004600f402'),
  0,
  'a regra com operador inválido não cria run — antes teria criado sempre'
);

select is(
  (select count(*)::int from public.automation_runs
    where trigger_event_id = '00000000-0000-0000-0000-00000e0f4003'
      and rule_id = '00000000-0000-0000-0000-00004600f401'),
  1,
  'a regra válida do MESMO evento continua a ser avaliada e cria o seu run'
);

select is(
  (select status from public.domain_events where id = '00000000-0000-0000-0000-00000e0f4003'),
  'completed',
  'o evento conclui: uma automação partida não consome as tentativas do evento'
);

select ok(
  (select detalhe->>'motivo' from public.automation_logs
    where rule_id = '00000000-0000-0000-0000-00004600f402' and evento = 'condicao_invalida')
    like '%aproximadamente%',
  'a configuração partida fica registada como condicao_invalida, com o motivo'
);

-- Configuração partida e condição que não casa são acontecimentos diferentes.
-- Sem esta separação, «porque é que a regra não disparou» tem uma resposta só
-- para duas causas que se resolvem de maneiras opostas.
select is(
  (select count(*)::int from public.automation_logs
    where rule_id = '00000000-0000-0000-0000-00004600f402' and evento = 'condicao_nao_satisfeita'),
  0,
  'uma regra partida não é registada como «condição não satisfeita»'
);

select * from finish();
rollback;
