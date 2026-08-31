begin;
select plan(5);

-- ============================================================================
-- A acção de email, separada da notificação
-- ============================================================================
--
-- Nesta fase o ficheiro cobre só as DUAS CORRECÇÕES que a divisão obriga.
-- Ainda não existe `acao_tipo = 'email'`, portanto não há comportamento novo a
-- exercitar — mas há duas formas de o partir em silêncio, e são estas.
--
-- As asserções são sobre a DEFINIÇÃO das funções e não sobre a execução, de
-- propósito: o que estas correcções mudam é uma decisão que só se manifesta
-- quando o tipo novo existir. Testar a execução hoje passaria sem provar nada,
-- e um teste que passa sem provar nada é pior do que não existir — foi assim
-- que o teste do painel de blocos validou a chave errada durante semanas.
-- ============================================================================

-- ── 1. A supressão por aviso em aberto ──────────────────────────────────────
--
-- Medido em produção a 2026-08-31: 354 `ignorada_aviso_em_aberto` contra 43
-- `executada` em 24h. É o caminho dominante, e é avaliado POR REGRA num laço
-- sem ORDER BY. Sem este guarda, a regra de email passaria a ser suprimida
-- pelo aviso que a regra de notificação acabou de criar — às vezes sim, às
-- vezes não, consoante a ordem em que o laço as apanhasse.
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

-- ── 2. O trigger que cancelaria todas as linhas de email ────────────────────
--
-- `fn_notifications_so_quando_ha_email` cancela a linha de `notifications`
-- quando a config diz `enviar_email = false`. Uma regra de email não tem esse
-- campo: sem este ramo, o coalesce daria false e cancelaria tudo.
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

-- ── 3. O que NÃO pode ter mudado ────────────────────────────────────────────
-- A Fase 3 congelou a definição no run. Uma cirurgia mal ancorada no executor
-- teria apagado isto sem ninguém dar por ela.
select ok(
  pg_get_functiondef('public.execute_automation_runs(integer)'::regprocedure)
    like '%jsonb_populate_record%',
  'o executor continua a ler a definição congelada, não a regra viva'
);

select * from finish();
rollback;
