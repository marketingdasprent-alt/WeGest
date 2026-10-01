-- Fecha o EXECUTE das funções do alerta de semana em falta.
--
-- O QUE ESTAVA MAL
-- A migração 20260915100000 criou três funções SECURITY DEFINER e não lhes
-- revogou o EXECUTE. No Postgres, uma função nasce com EXECUTE para PUBLIC —
-- o que aqui inclui o papel `anon`, ou seja, qualquer pedido sem sessão.
--
-- A grave é a seed_alerta_semana_em_falta(p_org_id uuid): sendo SECURITY
-- DEFINER, corre com os privilégios do dono e aceita um org_id à escolha de
-- quem chama. Um pedido anónimo podia semear regras e templates em QUALQUER
-- organização. É exactamente o buraco que o rls_anon_exposure.test.sql existe
-- para apanhar, e apanhou-o:
--
--     Failed test 30: "nenhuma função SECURITY DEFINER da aplicação é
--                      executável por anon fora da allowlist"
--             have: 3   want: 0
--
-- A emit_semanas_plataforma_em_falta_events() é menos grave mas igualmente
-- indevida: permitia a um anónimo forçar a emissão de eventos de todas as
-- organizações.
--
-- O PADRÃO
-- Todas as outras emit_*/seed_* já têm anon = false; as mais restritas
-- (emit_expiry_events, seed_automacao_defaults) fecham também ao
-- `authenticated`. É o caso destas: são chamadas pelo pg_cron e pelo trigger
-- de criação de organização, nunca a partir do browser.
--
-- Nota: revogar o EXECUTE não impede o trigger de disparar — uma função de
-- trigger corre por conta da operação na tabela, não por privilégio de quem
-- chama. O cron corre como `postgres` e também não é afectado.

REVOKE EXECUTE ON FUNCTION public.seed_alerta_semana_em_falta(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.tg_seed_alerta_semana_em_falta()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.emit_semanas_plataforma_em_falta_events()
  FROM PUBLIC, anon, authenticated;

-- Confirmação no próprio ficheiro: se alguma continuar aberta, aborta em vez
-- de deixar passar uma migração que não fez o que diz.
DO $verificar$
DECLARE
  v_abertas text;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO v_abertas
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'seed_alerta_semana_em_falta',
       'tg_seed_alerta_semana_em_falta',
       'emit_semanas_plataforma_em_falta_events'
     )
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  IF v_abertas IS NOT NULL THEN
    RAISE EXCEPTION
      'fechar_execute_do_alerta_semana_em_falta: ainda executáveis por anon/authenticated: %',
      v_abertas;
  END IF;

  RAISE NOTICE 'fechar_execute_do_alerta_semana_em_falta: as 3 funções ficaram fechadas a anon e authenticated.';
END;
$verificar$;
