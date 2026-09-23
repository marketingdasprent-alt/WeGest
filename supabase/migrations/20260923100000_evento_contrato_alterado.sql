-- Avisa o Administrador quando um contrato de motorista sofre alteração.
--
-- O QUE FALHA HOJE
-- `contratos` não publica nada no motor de automação. Mudar o estado, o
-- motorista, a viatura, as datas ou os km de check-in/check-out passa em
-- silêncio — e é nessas alterações que o aluguer semanal e a imputação de
-- custos mudam (a renda segue o contrato: 20260922 Contas/Resumo).
--
-- COMO
-- Evento `contrato.alterado`, pelo padrão exacto de `cartao_frota.alterado`
-- (20260922130000): tipo, mapa, regras gémeas notificacao+email no mesmo
-- grupo_id, template por organização, catálogo do editor.
--
-- DECISÕES
--   · Destinatários: cargo "Administrador", como o cartão. Outros cargos
--     acrescentam-se na aba de automações — a regra é editável e o seed só
--     corre uma vez por organização (ON CONFLICT DO NOTHING).
--   · Colunas vigiadas: status, motorista_id, viatura_id, empresa_id,
--     data_inicio, data_fim, duracao_meses, numero_contrato, km_checkout,
--     km_checkin, checkout_pendente, checkin_pendente, documento_url. Fora:
--     versao/atualizado_em (derivadas), motorista_* (snapshot da ficha),
--     combustível/electricidade/GPL (detalhe do check), calendario_evento_id,
--     template_id, cidade/data_assinatura.
--   · Uma alteração = um evento, mesmo que mudem 5 colunas.
--   · SEM link de entidade — mesma razão da 20260922130000: a supressão por
--     «aviso em aberto» (tipo, link) esconderia a 2.ª alteração atrás da 1.ª.
--     O sino cai em /contratos e a mensagem diz qual é o contrato.
--   · Cooldown 0. Volume medido a 2026-09-23: 1 UPDATE em `contratos` nos
--     últimos 7 dias — não há risco para o limite diário de emails.

-- ============================================================================
-- 1. Tipo e mapa
-- ============================================================================

INSERT INTO public.notificacao_tipos (tipo, descricao)
VALUES ('contrato_alterado',
        'Um contrato de motorista mudou de estado, motorista, viatura, datas, km ou documento.')
ON CONFLICT (tipo) DO NOTHING;

INSERT INTO public.notificacao_tipo_map (event_type, tipo_legado)
VALUES ('contrato.alterado', 'contrato_alterado')
ON CONFLICT (event_type) DO NOTHING;

-- ============================================================================
-- 2. Quem emite
-- ============================================================================

CREATE OR REPLACE FUNCTION public.contrato_motorista_nome(p_motorista_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select m.nome from public.motoristas_ativos m where m.id = p_motorista_id), '—')
$function$;

CREATE OR REPLACE FUNCTION public.contrato_viatura_matricula(p_viatura_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select v.matricula from public.viaturas v where v.id = p_viatura_id), 'sem viatura')
$function$;

CREATE OR REPLACE FUNCTION public.contrato_empresa_nome(p_empresa_id text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select e.nome from public.empresas e where e.id = p_empresa_id), p_empresa_id, '—')
$function$;

CREATE OR REPLACE FUNCTION public.fn_contrato_alterado_domain_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alteracoes   jsonb := '[]'::jsonb;
  v_alteracao    text;
  v_alterado_por text;
  v_texto        text;
  v_rotulo       text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'estado', 'antes', coalesce(OLD.status, '—'), 'depois', coalesce(NEW.status, '—'));
  END IF;

  IF NEW.motorista_id IS DISTINCT FROM OLD.motorista_id THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'motorista',
      'antes',  public.contrato_motorista_nome(OLD.motorista_id),
      'depois', public.contrato_motorista_nome(NEW.motorista_id));
  END IF;

  IF NEW.viatura_id IS DISTINCT FROM OLD.viatura_id THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'viatura',
      'antes',  public.contrato_viatura_matricula(OLD.viatura_id),
      'depois', public.contrato_viatura_matricula(NEW.viatura_id));
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'empresa',
      'antes',  public.contrato_empresa_nome(OLD.empresa_id),
      'depois', public.contrato_empresa_nome(NEW.empresa_id));
  END IF;

  IF NEW.data_inicio IS DISTINCT FROM OLD.data_inicio THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'início',
      'antes',  coalesce(to_char(OLD.data_inicio, 'DD/MM/YYYY'), '—'),
      'depois', coalesce(to_char(NEW.data_inicio, 'DD/MM/YYYY'), '—'));
  END IF;

  IF NEW.data_fim IS DISTINCT FROM OLD.data_fim THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'fim',
      'antes',  coalesce(to_char(OLD.data_fim, 'DD/MM/YYYY'), '—'),
      'depois', coalesce(to_char(NEW.data_fim, 'DD/MM/YYYY'), '—'));
  END IF;

  IF NEW.duracao_meses IS DISTINCT FROM OLD.duracao_meses THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'duração (meses)',
      'antes',  coalesce(OLD.duracao_meses::text, '—'),
      'depois', coalesce(NEW.duracao_meses::text, '—'));
  END IF;

  IF NEW.numero_contrato IS DISTINCT FROM OLD.numero_contrato THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'número',
      'antes',  coalesce(OLD.numero_contrato::text, '—'),
      'depois', coalesce(NEW.numero_contrato::text, '—'));
  END IF;

  IF NEW.km_checkout IS DISTINCT FROM OLD.km_checkout THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'km check-out',
      'antes',  coalesce(OLD.km_checkout::text, '—'),
      'depois', coalesce(NEW.km_checkout::text, '—'));
  END IF;

  IF NEW.km_checkin IS DISTINCT FROM OLD.km_checkin THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'km check-in',
      'antes',  coalesce(OLD.km_checkin::text, '—'),
      'depois', coalesce(NEW.km_checkin::text, '—'));
  END IF;

  IF NEW.checkout_pendente IS DISTINCT FROM OLD.checkout_pendente THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'check-out pendente',
      'antes',  case when OLD.checkout_pendente then 'sim' else 'não' end,
      'depois', case when NEW.checkout_pendente then 'sim' else 'não' end);
  END IF;

  IF NEW.checkin_pendente IS DISTINCT FROM OLD.checkin_pendente THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'check-in pendente',
      'antes',  case when OLD.checkin_pendente then 'sim' else 'não' end,
      'depois', case when NEW.checkin_pendente then 'sim' else 'não' end);
  END IF;

  IF NEW.documento_url IS DISTINCT FROM OLD.documento_url THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'documento',
      'antes',  case when OLD.documento_url is null then 'sem ficheiro' else 'com ficheiro' end,
      'depois', case when NEW.documento_url is null then 'sem ficheiro' else 'com ficheiro' end);
  END IF;

  -- Só mudou o que não se vigia (versao, atualizado_em, combustível, ...).
  IF jsonb_array_length(v_alteracoes) = 0 THEN
    RETURN NEW;
  END IF;

  -- Classificação grossa para as condições das regras.
  v_alteracao := CASE
    WHEN v_alteracoes @> '[{"campo":"estado"}]' THEN 'estado'
    WHEN v_alteracoes @> '[{"campo":"motorista"}]' OR v_alteracoes @> '[{"campo":"viatura"}]' THEN 'partes'
    WHEN v_alteracoes @> '[{"campo":"início"}]' OR v_alteracoes @> '[{"campo":"fim"}]'
         OR v_alteracoes @> '[{"campo":"duração (meses)"}]' THEN 'datas'
    WHEN v_alteracoes @> '[{"campo":"km check-out"}]' OR v_alteracoes @> '[{"campo":"km check-in"}]'
         OR v_alteracoes @> '[{"campo":"check-out pendente"}]' OR v_alteracoes @> '[{"campo":"check-in pendente"}]' THEN 'checks'
    ELSE 'dados'
  END;

  SELECT string_agg(a->>'campo' || ': ' || (a->>'antes') || ' → ' || (a->>'depois'), '; ')
    INTO v_texto
    FROM jsonb_array_elements(v_alteracoes) a;

  -- auth.uid() é nulo no cron e no service_role; a mensagem não o menciona.
  SELECT p.nome INTO v_alterado_por
    FROM public.profiles p
   WHERE p.id = auth.uid();

  v_rotulo := 'Contrato ' || coalesce('nº ' || NEW.numero_contrato::text, 'sem número')
              || ' de ' || coalesce(NEW.motorista_nome, public.contrato_motorista_nome(NEW.motorista_id));

  INSERT INTO public.domain_events
    (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  VALUES (
    NEW.org_id,
    'contrato.alterado',
    'contratos',
    NEW.id,
    jsonb_build_object(
      'numero_contrato',  NEW.numero_contrato,
      'status',           NEW.status,
      'alteracao',        v_alteracao,
      'motorista_id',     NEW.motorista_id,
      'motorista',        coalesce(NEW.motorista_nome, public.contrato_motorista_nome(NEW.motorista_id)),
      'viatura_id',       NEW.viatura_id,
      'viatura',          public.contrato_viatura_matricula(NEW.viatura_id),
      'empresa',          public.contrato_empresa_nome(NEW.empresa_id),
      'data_inicio',      NEW.data_inicio,
      'data_fim',         NEW.data_fim,
      'alteracoes',       v_alteracoes,
      'alteracoes_texto', v_texto,
      'alterado_por',     v_alterado_por,
      'mensagem',         v_rotulo || ' — ' || v_texto
                          || CASE WHEN v_alterado_por IS NOT NULL THEN ' (por ' || v_alterado_por || ')' ELSE '' END
    ),
    'trigger'
  );

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_contrato_alterado_domain_event() IS
  'Publica contrato.alterado em domain_events quando muda estado, motorista, viatura, empresa, datas, km ou documento de um contrato. Um UPDATE = um evento com a lista das alterações. Ver 20260923100000.';

REVOKE ALL ON FUNCTION public.fn_contrato_alterado_domain_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contrato_motorista_nome(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contrato_viatura_matricula(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contrato_empresa_nome(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contrato_motorista_nome(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contrato_viatura_matricula(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contrato_empresa_nome(text) TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_contrato_alterado_domain_event ON public.contratos;
CREATE TRIGGER trg_contrato_alterado_domain_event
  AFTER UPDATE OF status, motorista_id, viatura_id, empresa_id, data_inicio, data_fim,
                  duracao_meses, numero_contrato, km_checkout, km_checkin,
                  checkout_pendente, checkin_pendente, documento_url
  ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_alterado_domain_event();

-- ============================================================================
-- 3. Template e regras gémeas, por organização
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_alerta_contrato_alterado(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cargo_admin uuid;
  v_grupo  uuid := gen_random_uuid();
  v_config jsonb;
BEGIN
  INSERT INTO public.notification_templates
    (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, versao, ativo)
  VALUES (
    p_org_id, 'contrato.alterado', 'email', 'pt-PT',
    'Contrato nº {{numero_contrato}} de {{motorista}} alterado',
    'O contrato <b>nº {{numero_contrato}}</b> de <b>{{motorista}}</b> ' ||
    '(viatura {{viatura}}, {{empresa}}) sofreu uma alteração.<br><br>' ||
    '<b>{{alteracoes_texto}}</b><br><br>' ||
    'Estado actual: {{status}}. Início: {{data_inicio}}. Fim: {{data_fim}}.<br>' ||
    'Alterado por: {{alterado_por}}.',
    'html', 1, true
  )
  ON CONFLICT DO NOTHING;

  -- Ver 20260915100000: o cargo tem de existir antes da regra; em orgs novas
  -- é o trigger_auto_create_admin_cargo que o cria, e este trigger corre depois.
  SELECT c.id INTO v_cargo_admin
    FROM public.cargos c
   WHERE c.org_id = p_org_id AND c.nome = 'Administrador'
   ORDER BY c.created_at
   LIMIT 1;

  IF v_cargo_admin IS NULL THEN
    RAISE WARNING
      'seed_alerta_contrato_alterado: organização % não tem cargo "Administrador" — regras não criadas.',
      p_org_id;
    RETURN;
  END IF;

  v_config := jsonb_build_object(
    'titulo', 'Contrato alterado',
    'template_codigo', 'contrato.alterado',
    'destinatarios_estrategia', 'cargo',
    'destinatarios_modo', 'grupo',
    'destinatarios_cargo_ids', jsonb_build_array(v_cargo_admin)
  );

  INSERT INTO public.automation_rules
    (org_id, codigo, nome, descricao, event_type, condicoes, acao_tipo, acao_config,
     prioridade, cooldown_minutos, ativo, grupo_id)
  VALUES
    (p_org_id, 'contrato.alterado', 'Contrato alterado',
     'Avisa quando um contrato de motorista muda de estado, motorista, viatura, datas, km ou documento.',
     'contrato.alterado', '[]'::jsonb, 'notificacao', v_config, 'media', 0, true, v_grupo),
    (p_org_id, 'contrato.alterado.email', 'Contrato alterado (email)',
     'Envia por correio o que a regra contrato.alterado mostra no sino.',
     'contrato.alterado', '[]'::jsonb, 'email', v_config, 'media', 0, true, v_grupo)
  ON CONFLICT (codigo, org_id) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_alerta_contrato_alterado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_alerta_contrato_alterado(uuid) TO service_role;

-- Organizações que já existem.
DO $seed$
DECLARE
  v_org record;
BEGIN
  FOR v_org IN SELECT id FROM public.organizacoes LOOP
    PERFORM public.seed_alerta_contrato_alterado(v_org.id);
  END LOOP;
END;
$seed$;

-- Organizações novas.
CREATE OR REPLACE FUNCTION public.tg_seed_alerta_contrato_alterado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_alerta_contrato_alterado(NEW.id);
  RETURN NULL;
END;
$function$;

-- Função de trigger: o PostgreSQL só exige EXECUTE a quem cria o trigger
-- (20260922140000), por isso fica sem EXECUTE para toda a gente.
REVOKE ALL ON FUNCTION public.tg_seed_alerta_contrato_alterado() FROM PUBLIC, anon, authenticated;

-- 'trigger_seed_...' ordena depois de 'trigger_auto_create_admin_cargo'. Não
-- renomear sem verificar isto.
DROP TRIGGER IF EXISTS trigger_seed_alerta_contrato_alterado ON public.organizacoes;
CREATE TRIGGER trigger_seed_alerta_contrato_alterado
  AFTER INSERT ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_alerta_contrato_alterado();

-- ============================================================================
-- 4. Catálogo: o editor passa a conhecer os campos do evento
-- ============================================================================
-- Redefinição integral da 20260922130000 mais o evento novo. 'accoes' fica
-- igual — accoes_internas.test.sql fixa «exactamente três acções».

create or replace function public.automation_catalogo()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'eventos', jsonb_build_object(
      'assistencia_ticket.aberto_demasiado_tempo', jsonb_build_object(
        'label',    'Ticket aberto há demasiado tempo',
        'modulo',   'Assistência',
        'entidade', 'assistencia_tickets',
        'campos', jsonb_build_array(
          jsonb_build_object('id','prioridade','label','Prioridade','tipo','string'),
          jsonb_build_object('id','status',    'label','Estado',    'tipo','string')
        )
      ),
      'motorista.ficha_incompleta', jsonb_build_object(
        'label',    'Ficha de motorista incompleta',
        'modulo',   'Motoristas',
        'entidade', 'motoristas_ativos',
        'campos', jsonb_build_array(
          jsonb_build_object('id','nome','label','Nome','tipo','string')
        )
      ),
      'viatura.seguro_expirando', jsonb_build_object(
        'label',    'Seguro da viatura a expirar',
        'modulo',   'Viaturas',
        'entidade', 'viaturas',
        'campos', jsonb_build_array(
          jsonb_build_object('id','matricula','label','Matrícula','tipo','string')
        )
      ),
      'cartao_frota.alterado', jsonb_build_object(
        'label',    'Cartão de frota alterado',
        'modulo',   'Financeiro',
        'entidade', 'cartoes_frota',
        'campos', jsonb_build_array(
          jsonb_build_object('id','numero',       'label','Nº do cartão',        'tipo','string'),
          jsonb_build_object('id','tipo',         'label','Fornecedor (bp/repsol/edp)', 'tipo','string'),
          jsonb_build_object('id','status',       'label','Estado actual',       'tipo','string'),
          jsonb_build_object('id','alteracao',    'label','Tipo de alteração (titular/estado/plafond/dados)', 'tipo','string'),
          jsonb_build_object('id','titular_tipo', 'label','Titular actual (motorista/cliente/nenhum)', 'tipo','string')
        )
      ),
      'contrato.alterado', jsonb_build_object(
        'label',    'Contrato alterado',
        'modulo',   'Renting',
        'entidade', 'contratos',
        'campos', jsonb_build_array(
          jsonb_build_object('id','numero_contrato', 'label','Nº do contrato',   'tipo','number'),
          jsonb_build_object('id','status',          'label','Estado actual',    'tipo','string'),
          jsonb_build_object('id','alteracao',       'label','Tipo de alteração (estado/partes/datas/checks/dados)', 'tipo','string'),
          jsonb_build_object('id','motorista',       'label','Motorista',        'tipo','string'),
          jsonb_build_object('id','viatura',         'label','Matrícula',        'tipo','string'),
          jsonb_build_object('id','empresa',         'label','Empresa',          'tipo','string')
        )
      )
    ),
    'accoes', jsonb_build_object(
      'motorista.atualizar_campo', jsonb_build_object(
        'label',    'Preencher um campo do motorista',
        'modulo',   'Motoristas',
        'entidade', 'motoristas_ativos',
        'recurso',  'motoristas_editar',
        'campos_permitidos', jsonb_build_array('observacoes')
      ),
      'viatura.atualizar_campo', jsonb_build_object(
        'label',    'Preencher um campo da viatura',
        'modulo',   'Viaturas',
        'entidade', 'viaturas',
        'recurso',  'viaturas_editar',
        'campos_permitidos', jsonb_build_array('observacoes')
      ),
      'ticket.alterar_estado', jsonb_build_object(
        'label',    'Alterar o estado do ticket',
        'modulo',   'Assistência',
        'entidade', 'assistencia_tickets',
        'recurso',  'tickets_gerir',
        'valores', jsonb_build_array('pendente','aberto','em_andamento','aguardando','resolvido','fechado')
      )
    ),
    -- Fora de 'accoes' de propósito — ver 20260901120000.
    'notificacao_email', jsonb_build_object(
      'label',  'Enviar email',
      'modulo', 'Notificações'
    )
  );
$$;

NOTIFY pgrst, 'reload schema';
