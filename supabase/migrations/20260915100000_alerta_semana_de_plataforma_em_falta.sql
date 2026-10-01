-- Avisa quando uma semana de Uber ou Bolt não chegou.
--
-- O QUE FALHA HOJE
-- A ingestão falha em silêncio de duas maneiras diferentes, e nenhuma delas
-- deixa rasto que alguém veja:
--
--   1. Ninguém carrega o ficheiro. A Uber da Década Ousada é 100% upload
--      manual, e as semanas de 2026-07-20, 2026-08-10 e 2026-09-07 não têm
--      uma única linha. As semanas à volta valem 12 000 a 16 000 EUR cada.
--   2. O robô ou a API partem. A Bolt Urbango perdeu a semana de 2026-09-07
--      inteira — 3 839 viagens — porque a paginação trouxe menos do que a
--      Bolt declarou. O único rasto foi uma linha de log.
--
-- Medido a 2026-09-15, a regra abaixo apanha exactamente esses sete casos e
-- mais nenhum.
--
-- PORQUE É QUE ISTO VEM ANTES DE AUTOMATIZAR O ROBÔ
-- Um robô automático sem esta deteção volta ao mesmo sítio: uma semana não
-- chega e ninguém repara, só que a culpa passa a ser de um actor do Apify em
-- vez de uma pessoa. Foi assim que a Bolt esteve um mês sem CSV.
--
-- AS QUATRO DECISÕES
--   · Tolerância de 3 dias: uma semana que acabou ontem não está em falta, o
--     relatório pode nem estar publicado.
--   · Um aviso por semana, e não um por dia. Os outros emit_* deduplicam com
--     `processed_at is null` porque as condições deles resolvem-se sozinhas
--     (um recibo acaba por ser validado). Uma semana em falta não se resolve
--     sozinha — com essa regra, 2026-07-20 avisava todos os dias para sempre.
--   · Janela de 8 semanas: não se anda a chorar sobre Abril.
--   · Só a partir da primeira semana com dados de cada integração: uma
--     integração criada ontem não se queixa de não ter os últimos dois meses.

-- ============================================================================
-- 1. A cadeia até à notificação
-- ============================================================================
-- Emitir o evento não chega. Ver a migração 20260907100000: ela criou o
-- emit_* e o notificacao_tipo_map dos eventos dela, mas NÃO criou regra
-- nenhuma — e por isso 'cobranca.em_atraso' e 'motorista_recibo.por_validar'
-- são emitidos, processados, e não avisam ninguém até hoje. As três peças
-- (tipo, mapa, regra) têm de existir, senão isto morre da mesma maneira.

INSERT INTO public.notificacao_tipos (tipo, descricao)
VALUES ('plataforma_semana_em_falta',
        'Uma semana de dados de uma plataforma (Uber/Bolt) não chegou ao sistema.')
ON CONFLICT (tipo) DO NOTHING;

INSERT INTO public.notificacao_tipo_map (event_type, tipo_legado)
VALUES ('plataforma.semana_em_falta', 'plataforma_semana_em_falta')
ON CONFLICT (event_type) DO NOTHING;

-- ============================================================================
-- 2. Template e regra, por organização
-- ============================================================================

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
    'Falta a semana de {{semana_inicio}} na {{integracao_nome}}',
    'A integração <b>{{integracao_nome}}</b> ({{plataforma}}) não tem nenhuma linha ' ||
    'para a semana de {{semana_inicio}} a {{semana_fim}}.<br><br>' ||
    'Ou o ficheiro dessa semana nunca foi carregado, ou a sincronização falhou. ' ||
    'As semanas à volta desta têm dados — esta não tem nada.',
    'html', 1, true
  )
  ON CONFLICT DO NOTHING;

  -- O cargo tem de existir antes da regra. Em organizações novas quem o cria é
  -- o trigger_auto_create_admin_cargo — ver o comentário do trigger no fim
  -- deste ficheiro para a razão de o nome deste ordenar depois desse.
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
      'titulo', 'Falta uma semana de dados',
      'template_codigo', 'plataforma.semana_em_falta',
      'destinatarios_estrategia', 'cargo',
      'destinatarios_cargo_ids', jsonb_build_array(v_cargo_admin)
    ),
    'media',
    -- Sem cooldown a apagar avisos: cada semana em falta é um caso distinto e
    -- a deduplicação do emit_* já garante um aviso por semana.
    0,
    true
  )
  ON CONFLICT DO NOTHING;
END;
$function$;

-- Organizações que já existem.
DO $seed$
DECLARE
  v_org record;
BEGIN
  FOR v_org IN SELECT id FROM public.organizacoes LOOP
    PERFORM public.seed_alerta_semana_em_falta(v_org.id);
  END LOOP;
END;
$seed$;

-- Organizações novas.
CREATE OR REPLACE FUNCTION public.tg_seed_alerta_semana_em_falta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_alerta_semana_em_falta(NEW.id);
  RETURN NULL;
END;
$function$;

-- O nome importa. Os AFTER INSERT de organizacoes disparam por ordem
-- alfabética, e este tem de correr DEPOIS do trigger_auto_create_admin_cargo —
-- senão o cargo ainda não existe e a regra fica sem destinatários. Foi esse
-- exactamente o bug de 2026-07-28, em que organizações novas ficaram com
-- destinatarios_cargo_ids vazio. 'trigger_seed_...' ordena depois de
-- 'trigger_auto_...'; não renomear sem verificar isto.
DROP TRIGGER IF EXISTS trigger_seed_alerta_semana_em_falta ON public.organizacoes;
CREATE TRIGGER trigger_seed_alerta_semana_em_falta
  AFTER INSERT ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_alerta_semana_em_falta();

-- ============================================================================
-- 3. Quem deteta
-- ============================================================================

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
  )
  SELECT f.org_id,
         'plataforma.semana_em_falta',
         'plataformas_configuracao',
         f.id,
         jsonb_build_object(
           'plataforma', f.plat,
           'integracao_nome', f.nome,
           'semana_inicio', f.semana::text,
           'semana_fim', (f.semana + 6)::text
         ),
         'cron'
    FROM em_falta f
   -- Um aviso por semana, para sempre — e não um por dia. Repare-se que isto
   -- NÃO é `processed_at is null` como nos outros emit_*: ver o cabeçalho.
   WHERE NOT EXISTS (
     SELECT 1 FROM public.domain_events d
      WHERE d.event_type = 'plataforma.semana_em_falta'
        AND d.entity_table = 'plataformas_configuracao'
        AND d.entity_id = f.id
        AND d.payload->>'semana_inicio' = f.semana::text
   );
END;
$function$;

-- ============================================================================
-- 4. Agendamento
-- ============================================================================
-- Às 08:00, com os outros emit_*. O process_domain_events (*/5) trata do resto.

SELECT cron.unschedule('automation-emit-semanas-plataforma-em-falta')
 WHERE EXISTS (
   SELECT 1 FROM cron.job WHERE jobname = 'automation-emit-semanas-plataforma-em-falta'
 );

SELECT cron.schedule(
  'automation-emit-semanas-plataforma-em-falta',
  '0 8 * * *',
  $cron$ SELECT public.emit_semanas_plataforma_em_falta_events() $cron$
);
