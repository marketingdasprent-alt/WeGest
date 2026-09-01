begin;
select plan(18);

-- ============================================================================
-- A acção de email, separada da notificação
-- ============================================================================
--
-- Fixtures verificadas contra o schema real, não assumidas: `codigo` é TEXT
-- (não inteiro — é o próprio `event_type`, com UNIQUE(codigo, org_id)) e
-- `prioridade` é um enum de texto ('baixa'|'media'|'alta'), não um inteiro.
--
-- Uma organização e um utilizador próprios, e não `select ... limit 1`: numa
-- base reconstruída do zero (o que o CI faz) não há nenhuma linha em
-- `organizacoes` nem em `auth.users` à espera — foi exactamente por assumir
-- que já lá estava alguma coisa que este ficheiro falhou na primeira vez que
-- correu contra uma base a sério, em vez da produção onde foi escrito.
-- ============================================================================

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000e0000', 'Org Accao Email', 'accao-email-a');

-- `handle_new_user_org` (trigger em auth.users) atribui automaticamente o
-- utilizador novo a uma organização — a mais antiga `ativa=true` que
-- encontrar — e pode chegar aqui primeiro consoante o que já exista na base
-- nesse instante. Os `on conflict` a seguir garantem que os valores DESTE
-- fixture vencem de qualquer forma, em vez de assumir se o trigger corre ou
-- não: correcto tanto numa base vazia como numa com outras organizações.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e0001', 'gere@accao-email.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e0000')
on conflict (user_id) do update set org_id = excluded.org_id;

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-000000ce0001', 'Gere Automacoes', '00000000-0000-0000-0000-0000000e0000');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e0000', false,
   '00000000-0000-0000-0000-000000ce0001')
on conflict (user_id, org_id) do update
  set is_admin = excluded.is_admin, cargo_id = excluded.cargo_id;

insert into public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
select '00000000-0000-0000-0000-000000ce0001', r.id, '00000000-0000-0000-0000-0000000e0000', true, true
from public.recursos r where r.nome = 'automacoes';

-- ── Task 1: as duas correcções que a divisão obriga ─────────────────────────
select ok(
  pg_get_functiondef('public.process_domain_events(integer)'::regprocedure)
    like '%v_rule.acao_tipo = ''notificacao'' and v_tipo_legado%',
  'a supressão por aviso em aberto só se aplica a regras de notificação'
);

select ok(
  pg_get_functiondef('public.process_domain_events(integer)'::regprocedure)
    like '%ignorada_aviso_em_aberto%',
  'e continua a existir — o guarda restringe-a, não a apaga'
);

select ok(
  pg_get_functiondef('public.fn_notifications_so_quando_ha_email()'::regprocedure)
    like '%v_tipo = ''email''%',
  'o trigger deixa passar uma linha cuja regra é do tipo email'
);

select ok(
  pg_get_functiondef('public.fn_notifications_so_quando_ha_email()'::regprocedure)
    like '%enviar_email%',
  'e mantém o caminho antigo, enquanto houver regras por migrar'
);

select ok(
  pg_get_functiondef('public.execute_automation_runs(integer)'::regprocedure)
    like '%jsonb_populate_record%',
  'o executor continua a ler a definição congelada, não a regra viva'
);

-- ── Task 2: acao_tipo = 'email' ──────────────────────────────────────────────
-- Ambas as escritas correm com identidade real: sem isso testar-se-ia o ramo
-- de contexto de sistema, que nunca é recusado, e a asserção passaria sem
-- provar nada.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e0001', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000e0001","role":"authenticated"}', true);

select lives_ok($$
  insert into public.automation_rules (org_id, codigo, nome, event_type, condicoes,
                                       acao_tipo, acao_config, prioridade, cooldown_minutos, ativo)
  values ('00000000-0000-0000-0000-0000000e0000', 'zz.teste.pgtap.email', 'teste email',
          'viatura.seguro_expirando', '[]'::jsonb, 'email',
          jsonb_build_object('template_codigo','teste','titulo','Teste',
                             'destinatarios_cargo_ids', jsonb_build_array()),
          'media', 1440, true)
$$, 'o CHECK de acao_tipo aceita email, e o validador aceita a config mínima');

-- 23514 = check_violation, o ERRCODE explícito que fn_validar_acao_config usa
-- — não o P0001 genérico de um `raise exception` sem código.
select throws_ok($$
  insert into public.automation_rules (org_id, codigo, nome, event_type, condicoes,
                                       acao_tipo, acao_config, prioridade, cooldown_minutos, ativo)
  values ('00000000-0000-0000-0000-0000000e0000', 'zz.teste.pgtap.email.sem_template',
          'sem template', 'viatura.seguro_expirando', '[]'::jsonb, 'email',
          jsonb_build_object('titulo','X'), 'media', 1440, true)
$$, '23514', null, 'o validador exige template_codigo numa acção de email');

-- ── Fase 2: destinatarios_emails_livres ──────────────────────────────────
select lives_ok($$
  insert into public.automation_rules (org_id, codigo, nome, event_type, condicoes,
                                       acao_tipo, acao_config, prioridade, cooldown_minutos, ativo)
  values ('00000000-0000-0000-0000-0000000e0000', 'zz.teste.pgtap.email_livre', 'teste email livre',
          'viatura.seguro_expirando', '[]'::jsonb, 'email',
          jsonb_build_object('template_codigo','teste','titulo','Teste',
                             'destinatarios_emails_livres', jsonb_build_array('fornecedor@fora.pt')),
          'media', 1440, true)
$$, 'o validador aceita destinatarios_emails_livres numa acção de email');

select throws_ok($$
  insert into public.automation_rules (org_id, codigo, nome, event_type, condicoes,
                                       acao_tipo, acao_config, prioridade, cooldown_minutos, ativo)
  values ('00000000-0000-0000-0000-0000000e0000', 'zz.teste.pgtap.email_mal_formado',
          'endereço mal formado', 'viatura.seguro_expirando', '[]'::jsonb, 'email',
          jsonb_build_object('template_codigo','teste','titulo','Teste',
                             'destinatarios_emails_livres', jsonb_build_array('nao-e-email')),
          'media', 1440, true)
$$, '23514', null, 'o validador recusa um endereço mal formado');

select throws_ok($$
  insert into public.automation_rules (org_id, codigo, nome, event_type, condicoes,
                                       acao_tipo, acao_config, prioridade, cooldown_minutos, ativo)
  values ('00000000-0000-0000-0000-0000000e0000', 'zz.teste.pgtap.email_livre_notif',
          'não pode numa notificação', 'viatura.seguro_expirando', '[]'::jsonb, 'notificacao',
          jsonb_build_object('template_codigo','teste','titulo','Teste',
                             'destinatarios_cargo_ids', jsonb_build_array(),
                             'destinatarios_emails_livres', jsonb_build_array('a@b.pt')),
          'media', 1440, true)
$$, '23514', null, 'destinatarios_emails_livres é recusado numa notificação');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select ok(
  pg_get_functiondef('public.execute_automation_runs(integer)'::regprocedure)
    like '%v_enviar_email := (v_rule.acao_tipo = ''email'')%',
  'o executor decide o email pelo tipo da acção, não pela config'
);

select ok(
  (length(pg_get_functiondef('public.execute_automation_runs(integer)'::regprocedure))
   - length(replace(pg_get_functiondef('public.execute_automation_runs(integer)'::regprocedure),
                    'acao_tipo = ''notificacao'' and v_tipo_legado', '')))
  / length('acao_tipo = ''notificacao'' and v_tipo_legado') = 2,
  'os dois inserts em notificacoes ficam restritos a regras de notificação'
);

-- ── Task 3: a divisão das regras existentes, e o validador a recusar ───────
--
-- Isto corre DEPOIS da migração de divisão já ter passado (é uma migração,
-- não um `do $$`solto — já foi aplicada quando este ficheiro corre em CI).
-- As asserções verificam o RESULTADO, não repetem a divisão.

select is(
  (select count(*)::int from public.automation_rules
    where acao_tipo = 'notificacao' and acao_config ? 'enviar_email'),
  0,
  'nenhuma regra de notificação fica com enviar_email na config'
);

select is(
  (select count(*)::int from public.automation_rules
    where acao_tipo = 'notificacao' and acao_config ? 'enviar_email_digest'),
  0,
  'nem com enviar_email_digest'
);

-- A recusa é para QUEM CONFIGURA; o contexto de sistema está isento. Sem o
-- `set local role authenticated` E as duas claims, `auth.uid()` fica NULL e
-- este teste exerceria o ramo isento — foi assim que um teste de permissões
-- do MVP validou a fronteira errada, e é a mesma armadilha aqui.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, condicoes,
                                     acao_tipo, acao_config, prioridade, cooldown_minutos, ativo)
values ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000e0000',
        'zz.teste.pgtap.notificacao', 'teste notificação', 'viatura.seguro_expirando', '[]'::jsonb,
        'notificacao',
        jsonb_build_object('template_codigo','teste','titulo','Teste',
                           'destinatarios_cargo_ids', jsonb_build_array()),
        'media', 1440, true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e0001', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000e0001","role":"authenticated"}', true);

select throws_ok($$
  update public.automation_rules
     set acao_config = acao_config || jsonb_build_object('enviar_email', true)
   where id = '00000000-0000-0000-0000-0000000e0002'
$$, '23514', null, 'quem configura à mão não pode repor enviar_email numa notificação');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

-- E o contrário: o contexto de sistema continua a poder, senão o seed parte.
select lives_ok($$
  update public.automation_rules
     set acao_config = acao_config || jsonb_build_object('enviar_email', true)
   where id = '00000000-0000-0000-0000-0000000e0002'
$$, 'o contexto de sistema continua a poder — é o que deixa o seed funcionar');

-- ── Task 3, Step 5: uma organização nova nasce já dividida ─────────────────
select lives_ok($$
  insert into public.organizacoes (nome, codigo)
  values ('Org de teste da divisão (pgtap)', 'ZZ_PGTAP_DIV')
$$, 'criar uma organização nova continua a funcionar depois da divisão');

select ok(
  (select count(*) from public.automation_rules r
    join public.organizacoes o on o.id = r.org_id
   where o.codigo = 'ZZ_PGTAP_DIV' and r.acao_tipo = 'email') > 0,
  'a organização nova nasce já com as regras de email separadas'
);

select * from finish();
rollback;
