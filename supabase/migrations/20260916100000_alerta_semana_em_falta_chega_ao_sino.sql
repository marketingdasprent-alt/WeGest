-- O aviso de semana em falta passa a chegar ao sino.
--
-- O QUE ACONTECEU NA PRIMEIRA CORRIDA (2026-09-16, 08:00 UTC)
-- O cron emitiu 4 eventos `plataforma.semana_em_falta` (Uber Açores e Uber
-- Pró Peças, semanas de 2026-07-20 e 2026-08-10). Todos ficaram `completed`.
-- Dois runs correram e registaram «notificacoes_criadas: 8». Ninguém viu nada.
-- Três razões, todas listas escritas à mão que o evento novo não conhecia:
--
--   1. `processar_automation_run` traduz event_type → notificacoes.tipo com um
--      CASE de 18 entradas, e ignora a tabela `notificacao_tipo_map` que existe
--      exactamente para isso. Sem tipo legado, escreve só em `notifications` —
--      e aí o trigger `trg_notifications_so_quando_ha_email` cancela a linha
--      de qualquer regra sem email. Contou 8, gravou 0. O mesmo destino
--      esperava `cobranca.em_atraso`, `motorista_recibo.por_validar` e
--      `custo.sem_viatura`, que estão no mapa e não no CASE.
--
--   2. A policy de SELECT de `notificacoes` («ver notificacoes do meu cargo»)
--      é a ÚNICA permissiva da tabela, e enumera 22 tipos. Um tipo fora da
--      lista é invisível para o próprio destinatário. Passa a: qualquer tipo
--      que não seja dos três de cargo é visível a quem for o destinatário.
--
--   3. `idx_automation_runs_one_active_per_rule_entity` deixa um run activo
--      por (regra, entidade). Os 4 eventos entraram no mesmo lote de 5 minutos,
--      dois por integração; o segundo de cada bateu no índice e foi engolido
--      em silêncio (`exception when unique_violation then null`). As semanas
--      de 2026-08-10 nunca chegaram a run. A emissão passa a UM evento por
--      integração, com TODAS as semanas em falta no payload — emitido só
--      quando aparece uma semana que nunca foi avisada.
--
-- E mais uma coisa que não era bug mas era inútil: o aviso dizia «Falta uma
-- semana de dados» e nada mais. O motor passa a ler `payload->>'mensagem'`
-- para o texto — qualquer emit_* que o preencha passa a ter aviso legível.
--
-- Nada aqui apaga o que os utilizadores vêem hoje: as 3 alterações à função
-- são feitas por substituição textual sobre a definição viva (como na
-- 20260909120000), abortam se não reconhecerem o bloco, e não fazem nada
-- se já estiverem aplicadas.

-- ============================================================================
-- 1. Link da entidade: a integração aponta para a página de integrações
-- ============================================================================
-- O id vai na query string por duas razões: identifica a integração, e o
-- `process_domain_events` usa o link para suprimir avisos repetidos enquanto
-- houver um por resolver (tipo + link). Um link igual para todas as
-- integrações faria o aviso da segunda desaparecer atrás do da primeira.

CREATE OR REPLACE FUNCTION public.notificacao_link_entidade(p_entity_table text, p_entity_id uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_entity_table
    when 'viaturas'                 then '/viaturas/' || p_entity_id::text
    when 'motoristas_ativos'        then '/motoristas/' || p_entity_id::text
    when 'contratos_renting'        then '/renting/contratos/' || p_entity_id::text
    when 'profiles'                 then '/admin/utilizadores'
    when 'motorista_candidaturas'   then '/motoristas/candidaturas'
    when 'assistencia_tickets'      then '/assistencia/' || p_entity_id::text
    when 'plataformas_configuracao' then '/admin/settings?integracao=' || p_entity_id::text
    else null
  end
$function$;

-- ============================================================================
-- 2. processar_automation_run: mapa em vez de CASE, mensagem do payload,
--    link partilhado com o process_domain_events
-- ============================================================================

DO $mig$
DECLARE
  v_def text;
  v_n integer;

  -- (a) tipo legado: a lista fixa sai, entra a tabela.
  v_tipo_antes text := $a$  v_tipo_legado := case v_rule.event_type
    when 'viatura.seguro_expirando' then 'viatura_seguro_expirando'
    when 'viatura.inspecao_expirando' then 'viatura_inspecao_expirando'
    when 'motorista.carta_expirando' then 'motorista_carta_expirando'
    when 'motorista.licenca_tvde_expirando' then 'motorista_licenca_tvde_expirando'
    when 'cobranca.gerada' then 'cobranca_gerada'
    when 'utilizador.criado' then 'utilizador_criado'
    when 'contrato_renting.renovacao_proxima' then 'contrato_renting_renovacao_proxima'
    when 'contrato_renting.criado' then 'contrato_renting_criado'
    when 'motorista.candidatura_parada' then 'motorista_candidatura_parada'
    when 'contrato_renting.sem_checkin' then 'contrato_renting_sem_checkin'
    when 'viatura.extintor_expirando' then 'viatura_extintor_expirando'
    when 'viatura.iuc_a_pagar' then 'viatura_iuc_a_pagar'
    when 'viatura.manutencao_preventiva_expirando' then 'viatura_manutencao_preventiva_expirando'
    when 'motorista.reparacao_cobranca' then 'motorista_reparacao_cobranca'
    when 'assistencia_ticket.aberto_demasiado_tempo' then 'assistencia_ticket_aberto_demasiado_tempo'
    when 'motorista.ficha_incompleta' then 'motorista_ficha_incompleta'
    when 'invoice.nao_enviada_ao_cliente' then 'invoice_nao_enviada_ao_cliente'
    when 'seguranca.login_suspeito' then 'seguranca_login_suspeito'
    else null
  end;$a$;
  v_tipo_depois text := $a$  -- A tradução event_type → notificacoes.tipo vive em notificacao_tipo_map.
  -- Havia aqui um CASE com 18 entradas escrito à mão; um evento que só
  -- estivesse no mapa (o de semana em falta, o de cobrança em atraso...)
  -- ficava sem tipo, não escrevia em `notificacoes`, e ninguém o via.
  select m.tipo_legado into v_tipo_legado
    from public.notificacao_tipo_map m
   where m.event_type = v_rule.event_type;$a$;

  -- (b) link: a mesma função que o process_domain_events usa para suprimir
  -- avisos em aberto. Duas listas iguais divergem na primeira alteração.
  v_link_antes text := $b$  v_link := case v_run.entity_table
    when 'viaturas' then '/viaturas/' || v_run.entity_id::text
    when 'motoristas_ativos' then '/motoristas/' || v_run.entity_id::text
    when 'contratos_renting' then '/renting/contratos/' || v_run.entity_id::text
    when 'profiles' then '/admin/utilizadores'
    when 'motorista_candidaturas' then '/motoristas/candidaturas'
    when 'assistencia_tickets' then '/assistencia/' || v_run.entity_id::text
    else null
  end;$b$;
  v_link_depois text := $b$  v_link := public.notificacao_link_entidade(v_run.entity_table, v_run.entity_id);$b$;

  -- (c) mensagem: o emit_* pode dizer o que se passa. Aparece nas duas
  -- escritas em `notificacoes` (estratégia motorista e estratégia cargo).
  v_msg_antes text := $c$          coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
          null,
          'normal',$c$;
  v_msg_depois text := $c$          coalesce(v_rule.acao_config->>'titulo', v_rule.nome),
          v_run.payload->>'mensagem',
          'normal',$c$;
BEGIN
  -- Colado no SQL Editor a partir do Windows, o ficheiro chega com CRLF e os
  -- blocos acima deixam de bater com a definição viva (que só tem LF). Foi o
  -- que aconteceu na primeira tentativa de aplicar: «bloco do tipo legado
  -- não encontrado». Normalizar antes de comparar.
  v_tipo_antes  := replace(v_tipo_antes,  E'\r', '');
  v_tipo_depois := replace(v_tipo_depois, E'\r', '');
  v_link_antes  := replace(v_link_antes,  E'\r', '');
  v_link_depois := replace(v_link_depois, E'\r', '');
  v_msg_antes   := replace(v_msg_antes,   E'\r', '');
  v_msg_depois  := replace(v_msg_depois,  E'\r', '');

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'processar_automation_run'
     AND p.prokind = 'f';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'processar_automation_run não encontrada';
  END IF;

  -- (a)
  IF position(v_tipo_depois IN v_def) = 0 THEN
    IF position(v_tipo_antes IN v_def) = 0 THEN
      RAISE EXCEPTION 'bloco do tipo legado não encontrado — nada aplicado';
    END IF;
    v_def := replace(v_def, v_tipo_antes, v_tipo_depois);
  END IF;

  -- (b)
  IF position(v_link_depois IN v_def) = 0 THEN
    IF position(v_link_antes IN v_def) = 0 THEN
      RAISE EXCEPTION 'bloco do link não encontrado — nada aplicado';
    END IF;
    v_def := replace(v_def, v_link_antes, v_link_depois);
  END IF;

  -- (c) — são duas ocorrências iguais; replace() troca as duas.
  IF position(v_msg_depois IN v_def) = 0 THEN
    SELECT count(*) INTO v_n
      FROM regexp_matches(v_def, regexp_replace(v_msg_antes, '([().>|])', '\\\1', 'g'), 'g');
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'esperava 2 escritas em notificacoes com mensagem null, encontrei % — nada aplicado', v_n;
    END IF;
    v_def := replace(v_def, v_msg_antes, v_msg_depois);
  END IF;

  EXECUTE v_def;
END
$mig$;

REVOKE ALL ON FUNCTION public.processar_automation_run(public.automation_runs) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.processar_automation_run(public.automation_runs) TO service_role;

-- ============================================================================
-- 3. RLS de notificacoes: o destinatário vê o que lhe é dirigido, seja de que
--    tipo for
-- ============================================================================
-- Os três tipos de cargo (motorista_pendente, escalonamento, pedido_troca_kms)
-- não têm destinatário individual e continuam a ser vistos pelo cargo. Todos os
-- outros — hoje 25, amanhã mais — são vistos por quem estiver em
-- destinatario_id. A policy de isolamento por org é RESTRICTIVE e continua a
-- valer por cima.

DROP POLICY IF EXISTS "ver notificacoes do meu cargo" ON public.notificacoes;
CREATE POLICY "ver notificacoes do meu cargo" ON public.notificacoes
  FOR SELECT
  USING (
    org_id = public.get_current_org_id()
    AND (
      (
        tipo = 'motorista_pendente'
        AND (
          public.is_current_user_admin()
          OR public.current_user_cargo() = ANY (ARRAY['Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE'])
        )
      )
      OR (
        tipo IN ('escalonamento', 'pedido_troca_kms')
        AND (public.is_current_user_admin() OR public.current_user_cargo() = 'Supervisor Gestor TVDE')
      )
      OR (
        tipo NOT IN ('motorista_pendente', 'escalonamento', 'pedido_troca_kms')
        AND destinatario_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- 4. Emissão: um evento por integração, com todas as semanas em falta
-- ============================================================================
-- Regra de emissão: emite-se quando há pelo menos uma semana em falta que
-- nunca constou de um aviso anterior desta integração. O payload traz sempre
-- o conjunto completo do momento — quem lê o aviso vê o estado, não um pedaço.
-- Uma semana que é preenchida não gera nada (não há novidade a avisar).
--
-- Compatível com os eventos já emitidos com o formato antigo (só
-- `semana_inicio`): contam como «já avisada» para essa semana.

CREATE OR REPLACE FUNCTION public.emit_semanas_plataforma_em_falta_events()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.domain_events
    (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  WITH integ AS (
    SELECT p.id, p.nome, p.org_id, p.robot_target_platform AS plat
      FROM public.plataformas_configuracao p
     WHERE p.ativo
       AND p.org_id IS NOT NULL
       AND p.robot_target_platform IN ('uber', 'bolt')
  ),
  dados AS (
    SELECT integracao_id, periodo_inicio FROM public.uber_resumos_semanais
    UNION ALL
    SELECT integracao_id, periodo_inicio FROM public.bolt_resumos_semanais
  ),
  -- A partir de quando é que faz sentido cobrar semanas a esta integração.
  primeira AS (
    SELECT integracao_id, min(periodo_inicio) AS desde FROM dados GROUP BY 1
  ),
  semanas AS (
    SELECT generate_series(
             date_trunc('week', now())::date - interval '8 weeks',
             date_trunc('week', now())::date - interval '1 week',
             interval '1 week')::date AS semana
  ),
  em_falta AS (
    SELECT i.id, i.nome, i.org_id, i.plat, s.semana
      FROM integ i
      CROSS JOIN semanas s
      JOIN primeira pr ON pr.integracao_id = i.id AND s.semana >= pr.desde
     WHERE s.semana + 6 <= current_date - 3   -- tolerância: o relatório pode ainda não existir
       AND NOT EXISTS (
         SELECT 1 FROM dados d
          WHERE d.integracao_id = i.id AND d.periodo_inicio = s.semana
       )
  ),
  -- Semanas que já constaram de algum aviso desta integração, em qualquer
  -- dos dois formatos de payload.
  ja_avisadas AS (
    SELECT d.entity_id, s.semana
      FROM public.domain_events d
      CROSS JOIN LATERAL jsonb_array_elements_text(
        coalesce(d.payload->'semanas', jsonb_build_array(d.payload->>'semana_inicio'))
      ) AS s(semana)
     WHERE d.event_type = 'plataforma.semana_em_falta'
       AND d.entity_table = 'plataformas_configuracao'
  ),
  por_integracao AS (
    SELECT f.id, f.nome, f.org_id, f.plat,
           array_agg(f.semana ORDER BY f.semana) AS semanas,
           bool_or(NOT EXISTS (
             SELECT 1 FROM ja_avisadas j
              WHERE j.entity_id = f.id AND j.semana = f.semana::text
           )) AS tem_semana_nova
      FROM em_falta f
     GROUP BY f.id, f.nome, f.org_id, f.plat
  )
  SELECT p.org_id,
         'plataforma.semana_em_falta',
         'plataformas_configuracao',
         p.id,
         jsonb_build_object(
           'plataforma', p.plat,
           'integracao_nome', p.nome,
           'semanas', to_jsonb(p.semanas),
           'n_semanas', cardinality(p.semanas),
           -- A primeira, para quem ainda lê o formato antigo.
           'semana_inicio', p.semanas[1]::text,
           'semana_fim', (p.semanas[1] + 6)::text,
           'semanas_texto', (
             SELECT string_agg(to_char(s, 'DD/MM') || ' a ' || to_char(s + 6, 'DD/MM'), ', ' ORDER BY s)
               FROM unnest(p.semanas) s
           ),
           -- O que aparece no sino, por baixo do título.
           'mensagem', p.nome || ': sem dados nas semanas de ' || (
             SELECT string_agg(to_char(s, 'DD/MM'), ', ' ORDER BY s) FROM unnest(p.semanas) s
           )
         ),
         'cron'
    FROM por_integracao p
   WHERE p.tem_semana_nova;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.emit_semanas_plataforma_em_falta_events() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. Template de email e seed: o assunto e o corpo falam em semanas, no plural
-- ============================================================================

UPDATE public.notification_templates
   SET assunto = 'Faltam semanas de dados na {{integracao_nome}}',
       corpo_template =
         'A integração <b>{{integracao_nome}}</b> ({{plataforma}}) não tem nenhuma linha ' ||
         'para as semanas de {{semanas_texto}}.<br><br>' ||
         'Ou o ficheiro dessas semanas nunca foi carregado, ou a sincronização falhou. ' ||
         'As semanas à volta têm dados — estas não têm nada.'
 WHERE codigo = 'plataforma.semana_em_falta'
   AND corpo_template LIKE '%{{semana_inicio}} a {{semana_fim}}%';

CREATE OR REPLACE FUNCTION public.seed_alerta_semana_em_falta(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cargo_admin uuid;
BEGIN
  INSERT INTO public.notification_templates
    (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, versao, ativo)
  VALUES (
    p_org_id, 'plataforma.semana_em_falta', 'email', 'pt-PT',
    'Faltam semanas de dados na {{integracao_nome}}',
    'A integração <b>{{integracao_nome}}</b> ({{plataforma}}) não tem nenhuma linha ' ||
    'para as semanas de {{semanas_texto}}.<br><br>' ||
    'Ou o ficheiro dessas semanas nunca foi carregado, ou a sincronização falhou. ' ||
    'As semanas à volta têm dados — estas não têm nada.',
    'html', 1, true
  )
  ON CONFLICT DO NOTHING;

  -- O cargo tem de existir antes da regra. Em organizações novas quem o cria é
  -- o trigger_auto_create_admin_cargo — ver a migração 20260915100000 para a
  -- razão de o nome do trigger de seed ordenar depois desse.
  SELECT c.id INTO v_cargo_admin
    FROM public.cargos c
   WHERE c.org_id = p_org_id AND c.nome = 'Administrador'
   ORDER BY c.created_at
   LIMIT 1;

  IF v_cargo_admin IS NULL THEN
    RAISE WARNING
      'seed_alerta_semana_em_falta: organização % não tem cargo "Administrador" — regra não criada.',
      p_org_id;
    RETURN;
  END IF;

  INSERT INTO public.automation_rules
    (org_id, codigo, nome, descricao, event_type, condicoes, acao_tipo, acao_config,
     prioridade, cooldown_minutos, ativo)
  VALUES (
    p_org_id,
    'plataforma.semana_em_falta',
    'Semana de plataforma em falta',
    'Avisa quando uma semana de Uber ou Bolt não tem uma única linha de resumo.',
    'plataforma.semana_em_falta',
    '[]'::jsonb,
    'notificacao',
    jsonb_build_object(
      'titulo', 'Faltam semanas de dados de plataforma',
      'template_codigo', 'plataforma.semana_em_falta',
      'destinatarios_estrategia', 'cargo',
      'destinatarios_cargo_ids', jsonb_build_array(v_cargo_admin)
    ),
    'media',
    0,
    true
  )
  ON CONFLICT DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.seed_alerta_semana_em_falta(uuid) FROM PUBLIC, anon, authenticated;

UPDATE public.automation_rules
   SET acao_config = acao_config || jsonb_build_object('titulo', 'Faltam semanas de dados de plataforma')
 WHERE codigo = 'plataforma.semana_em_falta'
   AND acao_config->>'titulo' = 'Falta uma semana de dados';

-- ============================================================================
-- 6. Os eventos da primeira corrida que nunca chegaram a run
-- ============================================================================
-- Com a regra nova, um evento antigo conta como «semana já avisada». Os dois
-- que foram engolidos pelo índice (2026-08-10, nas duas integrações) nunca
-- avisaram ninguém, por isso saem — na corrida seguinte entram no evento
-- único da integração, ao lado da semana de 2026-07-20. Os dois que tiveram
-- run ficam: a sua semana volta a aparecer no payload completo de qualquer
-- maneira.

DELETE FROM public.domain_events d
 WHERE d.event_type = 'plataforma.semana_em_falta'
   AND d.status = 'completed'
   AND NOT EXISTS (
     SELECT 1 FROM public.automation_runs r WHERE r.trigger_event_id = d.id
   );

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 7. Confirmação no próprio ficheiro
-- ============================================================================
DO $verificar$
DECLARE
  v_def text := pg_get_functiondef('public.processar_automation_run(public.automation_runs)'::regprocedure);
BEGIN
  IF position('notificacao_tipo_map' IN v_def) = 0 THEN
    RAISE EXCEPTION 'processar_automation_run continua sem ler notificacao_tipo_map';
  END IF;
  IF position('notificacao_link_entidade' IN v_def) = 0 THEN
    RAISE EXCEPTION 'processar_automation_run continua com a lista de links à mão';
  END IF;
  IF position($m$v_run.payload->>'mensagem'$m$ IN v_def) = 0 THEN
    RAISE EXCEPTION 'processar_automation_run continua a gravar mensagem null';
  END IF;
  IF public.notificacao_link_entidade('plataformas_configuracao', '00000000-0000-0000-0000-000000000001')
     IS DISTINCT FROM '/admin/settings?integracao=00000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'notificacao_link_entidade não resolve plataformas_configuracao';
  END IF;
  RAISE NOTICE 'alerta_semana_em_falta_chega_ao_sino: aplicada.';
END;
$verificar$;
