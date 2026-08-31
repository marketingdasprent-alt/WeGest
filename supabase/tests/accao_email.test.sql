begin;
select plan(15);

-- ============================================================================
-- A acção de email, separada da notificação
-- ============================================================================
--
-- Fixtures verificadas contra o schema real, não assumidas: `codigo` é TEXT
-- (não inteiro — é o próprio `event_type`, com UNIQUE(codigo, org_id)) e
-- `prioridade` é um enum de texto ('baixa'|'media'|'alta'), não um inteiro.
-- Assumir os tipos errados aqui teria feito os testes falhar por motivos que
-- nada têm a ver com o que se está a testar.
-- ============================================================================

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
select lives_ok($$
  insert into public.automation_rules (org_id, codigo, nome, event_type, condicoes,
                                       acao_tipo, acao_config, prioridade, cooldown_minutos, ativo)
  values ((select id from public.organizacoes limit 1), 'zz.teste.pgtap.email', 'teste email',
          'viatura.seguro_expirando', '[]'::jsonb, 'email',
          jsonb_build_object('template_codigo','teste','titulo','Teste',
                             'destinatarios_cargo_ids', jsonb_build_array()),
          'media', 1440, true)
$$, 'o CHECK de acao_tipo aceita email, e o validador aceita a config mínima');

select throws_ok($$
  insert into public.automation_rules (org_id, codigo, nome, event_type, condicoes,
                                       acao_tipo, acao_config, prioridade, cooldown_minutos, ativo)
  values ((select id from public.organizacoes limit 1), 'zz.teste.pgtap.email.sem_template',
          'sem template', 'viatura.seguro_expirando', '[]'::jsonb, 'email',
          jsonb_build_object('titulo','X'), 'media', 1440, true)
$$, 'P0001', null, 'o validador exige template_codigo numa acção de email');

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

-- A recusa é para QUEM CONFIGURA; o contexto de sistema está isento. Correr
-- este teste sem identidade testaria o ramo isento e passaria sem provar nada
-- — foi assim que um teste de permissões do MVP validou a fronteira errada.
select set_config('request.jwt.claim.sub',
  (select id::text from auth.users limit 1), true);

select throws_ok($$
  update public.automation_rules
     set acao_config = acao_config || jsonb_build_object('enviar_email', true)
   where id = (select id from public.automation_rules where acao_tipo = 'notificacao' limit 1)
$$, 'P0001', null, 'quem configura à mão não pode repor enviar_email numa notificação');

-- E o contrário: o contexto de sistema continua a poder, senão o seed parte.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select lives_ok($$
  update public.automation_rules
     set acao_config = acao_config || jsonb_build_object('enviar_email', true)
   where id = (select id from public.automation_rules where acao_tipo = 'notificacao' limit 1)
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
