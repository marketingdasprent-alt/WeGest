-- Avisa quando um cartão de combustível/frota sofre alteração.
--
-- O QUE FALHA HOJE
-- `cartoes_frota` só avisa no INSERT (`trg_cartao_frota_email_aviso`, email
-- fixo para uma caixa de marketing). Mudar o titular, cancelar, bloquear,
-- alterar o plafond ou o número passa em silêncio — e é exactamente nessas
-- alterações que o dinheiro muda de mãos: o gasto do cartão segue o titular
-- (ver 20260909150000). A memória de 2026-09-09 tem 2 862 € imputados a
-- motoristas que já tinham devolvido o cartão sem ninguém ter sido avisado.
--
-- COMO
-- Evento `cartao_frota.alterado` no motor de automação, com as três peças
-- que a migração 20260915100000 mostrou serem obrigatórias (tipo, mapa,
-- regra) — e aqui uma quarta, porque o pedido é «notificação E email»: o
-- executor só escreve em `notificacoes` para regras 'notificacao' e só mete
-- na fila para regras 'email'. São duas regras gémeas com o mesmo grupo_id,
-- como as 66 que `fn_dividir_email_das_regras` criou.
--
-- DECISÕES
--   · Colunas vigiadas: titular (motorista_id, cliente_id), estado (status,
--     ativo), identidade (numero, tipo), dinheiro (limite), datas (validade,
--     entrega, devolução). Fora: notas, pin, detentor, devolucao, ambito,
--     ultimo_*. `detentor` fica de fora de propósito — há 334 cartões com
--     texto livre à espera de triagem, e essa triagem em lote seria 334 avisos.
--   · Uma alteração = um evento, mesmo que mude 5 colunas. `atribuir_cartao_frota`
--     e `devolver_cartao_frota` fazem um só UPDATE em `cartoes_frota`, logo
--     uma atribuição é um aviso, não três.
--   · SEM link de entidade em `notificacao_link_entidade`. O
--     `process_domain_events` suprime um evento quando já existe aviso por
--     resolver com o mesmo (tipo, link). Para um seguro a expirar isso é
--     certo; para alterações não: devolver o cartão uma hora depois de o
--     atribuir é outro facto, e ficaria escondido atrás do primeiro aviso.
--     O sino cai na rota da lista de cartões (frontend), e a mensagem diz
--     qual é o cartão.
--   · Cooldown 0: cada alteração é um caso. O índice de «um run activo por
--     regra+entidade» ainda engole a segunda alteração do mesmo cartão dentro
--     do mesmo lote de 5 minutos — aceite, é o comportamento de todo o motor.
--   · O email do INSERT fica como está. Migrá-lo para o motor é outra tarefa.

-- ============================================================================
-- 1. Tipo e mapa
-- ============================================================================

INSERT INTO public.notificacao_tipos (tipo, descricao)
VALUES ('cartao_frota_alterado',
        'Um cartão de combustível/frota mudou de titular, estado, plafond ou identificação.')
ON CONFLICT (tipo) DO NOTHING;

INSERT INTO public.notificacao_tipo_map (event_type, tipo_legado)
VALUES ('cartao_frota.alterado', 'cartao_frota_alterado')
ON CONFLICT (event_type) DO NOTHING;

-- ============================================================================
-- 2. Quem emite
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cartao_frota_tipo_label(p_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_tipo when 'bp' then 'BP' when 'repsol' then 'Repsol' when 'edp' then 'EDP' else coalesce(p_tipo, '—') end
$function$;

-- Nome do titular para a mensagem. Motorista ou cliente; nenhum = «sem titular».
CREATE OR REPLACE FUNCTION public.cartao_frota_titular_nome(p_motorista_id uuid, p_cliente_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select m.nome from public.motoristas_ativos m where m.id = p_motorista_id),
    (select c.nome::text from public.clientes c where c.id = p_cliente_id),
    'sem titular'
  )
$function$;

CREATE OR REPLACE FUNCTION public.fn_cartao_frota_alterado_domain_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alteracoes   jsonb := '[]'::jsonb;
  v_alteracao    text;
  v_titular_antes  text;
  v_titular_depois text;
  v_alterado_por text;
  v_texto        text;
BEGIN
  -- Titular primeiro: é a alteração que mexe em quem paga o combustível.
  IF (NEW.motorista_id IS DISTINCT FROM OLD.motorista_id)
     OR (NEW.cliente_id IS DISTINCT FROM OLD.cliente_id) THEN
    v_titular_antes  := public.cartao_frota_titular_nome(OLD.motorista_id, OLD.cliente_id);
    v_titular_depois := public.cartao_frota_titular_nome(NEW.motorista_id, NEW.cliente_id);
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'titular', 'antes', v_titular_antes, 'depois', v_titular_depois);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'estado', 'antes', OLD.status, 'depois', NEW.status);
  END IF;

  IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'ativo',
      'antes',  case when OLD.ativo then 'sim' else 'não' end,
      'depois', case when NEW.ativo then 'sim' else 'não' end);
  END IF;

  IF NEW.limite IS DISTINCT FROM OLD.limite THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'plafond',
      'antes',  coalesce(OLD.limite::text, '—'),
      'depois', coalesce(NEW.limite::text, '—'));
  END IF;

  IF NEW.numero IS DISTINCT FROM OLD.numero THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'número', 'antes', OLD.numero, 'depois', NEW.numero);
  END IF;

  IF NEW.tipo IS DISTINCT FROM OLD.tipo THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'tipo',
      'antes',  public.cartao_frota_tipo_label(OLD.tipo),
      'depois', public.cartao_frota_tipo_label(NEW.tipo));
  END IF;

  IF NEW.data_validade IS DISTINCT FROM OLD.data_validade THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'validade',
      'antes',  coalesce(to_char(OLD.data_validade, 'DD/MM/YYYY'), '—'),
      'depois', coalesce(to_char(NEW.data_validade, 'DD/MM/YYYY'), '—'));
  END IF;

  IF NEW.data_entrega IS DISTINCT FROM OLD.data_entrega THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'data de entrega',
      'antes',  coalesce(to_char(OLD.data_entrega, 'DD/MM/YYYY'), '—'),
      'depois', coalesce(to_char(NEW.data_entrega, 'DD/MM/YYYY'), '—'));
  END IF;

  IF NEW.data_devolucao IS DISTINCT FROM OLD.data_devolucao THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'data de devolução',
      'antes',  coalesce(to_char(OLD.data_devolucao, 'DD/MM/YYYY'), '—'),
      'depois', coalesce(to_char(NEW.data_devolucao, 'DD/MM/YYYY'), '—'));
  END IF;

  -- Só mudou o que não se vigia (notas, updated_at, ...): nada a avisar.
  IF jsonb_array_length(v_alteracoes) = 0 THEN
    RETURN NEW;
  END IF;

  -- Classificação grossa para as condições das regras: o que importa mais.
  v_alteracao := CASE
    WHEN v_alteracoes @> '[{"campo":"titular"}]' THEN 'titular'
    WHEN v_alteracoes @> '[{"campo":"estado"}]' OR v_alteracoes @> '[{"campo":"ativo"}]' THEN 'estado'
    WHEN v_alteracoes @> '[{"campo":"plafond"}]' THEN 'plafond'
    ELSE 'dados'
  END;

  SELECT string_agg(a->>'campo' || ': ' || (a->>'antes') || ' → ' || (a->>'depois'), '; ')
    INTO v_texto
    FROM jsonb_array_elements(v_alteracoes) a;

  -- auth.uid() é nulo no cron e no service_role; o nome fica em branco e a
  -- mensagem não o menciona.
  SELECT p.nome INTO v_alterado_por
    FROM public.profiles p
   WHERE p.id = auth.uid();

  INSERT INTO public.domain_events
    (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  VALUES (
    NEW.org_id,
    'cartao_frota.alterado',
    'cartoes_frota',
    NEW.id,
    jsonb_build_object(
      'numero',          NEW.numero,
      'tipo',            NEW.tipo,
      'tipo_label',      public.cartao_frota_tipo_label(NEW.tipo),
      'status',          NEW.status,
      'ativo',           NEW.ativo,
      'alteracao',       v_alteracao,
      'titular_tipo',    CASE WHEN NEW.motorista_id IS NOT NULL THEN 'motorista'
                              WHEN NEW.cliente_id   IS NOT NULL THEN 'cliente'
                              ELSE 'nenhum' END,
      'titular',         public.cartao_frota_titular_nome(NEW.motorista_id, NEW.cliente_id),
      'titular_antes',   v_titular_antes,
      'titular_depois',  v_titular_depois,
      'alteracoes',      v_alteracoes,
      'alteracoes_texto', v_texto,
      'alterado_por',    v_alterado_por,
      'mensagem',        'Cartão ' || public.cartao_frota_tipo_label(NEW.tipo) || ' nº ' || NEW.numero
                         || ' — ' || v_texto
                         || CASE WHEN v_alterado_por IS NOT NULL THEN ' (por ' || v_alterado_por || ')' ELSE '' END
    ),
    'trigger'
  );

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_cartao_frota_alterado_domain_event() IS
  'Publica cartao_frota.alterado em domain_events quando muda titular, estado, plafond, número, tipo ou datas de um cartão. Um UPDATE = um evento com a lista das alterações. Ver 20260922130000.';

REVOKE ALL ON FUNCTION public.fn_cartao_frota_alterado_domain_event() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cartao_frota_titular_nome(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cartao_frota_tipo_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cartao_frota_tipo_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cartao_frota_titular_nome(uuid, uuid) TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_cartao_frota_alterado_domain_event ON public.cartoes_frota;
CREATE TRIGGER trg_cartao_frota_alterado_domain_event
  AFTER UPDATE OF motorista_id, cliente_id, status, ativo, limite, numero, tipo,
                  data_validade, data_entrega, data_devolucao
  ON public.cartoes_frota
  FOR EACH ROW EXECUTE FUNCTION public.fn_cartao_frota_alterado_domain_event();

-- ============================================================================
-- 3. Template e regras gémeas, por organização
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_alerta_cartao_frota_alterado(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cargo_admin uuid;
  v_grupo uuid := gen_random_uuid();
  v_config jsonb;
BEGIN
  INSERT INTO public.notification_templates
    (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, versao, ativo)
  VALUES (
    p_org_id, 'cartao_frota.alterado', 'email', 'pt-PT',
    'Cartão {{tipo_label}} nº {{numero}} alterado',
    'O cartão <b>{{tipo_label}} nº {{numero}}</b> sofreu uma alteração.<br><br>' ||
    '<b>{{alteracoes_texto}}</b><br><br>' ||
    'Titular actual: {{titular}}. Estado: {{status}}.<br>' ||
    'Alterado por: {{alterado_por}}.<br><br>' ||
    'Se o titular mudou, confirme a data de fecho do período anterior — é ela que decide ' ||
    'a quem é imputado o combustível.',
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
      'seed_alerta_cartao_frota_alterado: organização % não tem cargo "Administrador" — regras não criadas.',
      p_org_id;
    RETURN;
  END IF;

  v_config := jsonb_build_object(
    'titulo', 'Cartão de frota alterado',
    'template_codigo', 'cartao_frota.alterado',
    'destinatarios_estrategia', 'cargo',
    'destinatarios_cargo_ids', jsonb_build_array(v_cargo_admin)
  );

  -- Duas linhas, um grupo: o executor só escreve no sino para 'notificacao' e
  -- só mete na fila de email para 'email'. É o padrão das gémeas de
  -- fn_dividir_email_das_regras, e o editor mostra-as como uma automação.
  INSERT INTO public.automation_rules
    (org_id, codigo, nome, descricao, event_type, condicoes, acao_tipo, acao_config,
     prioridade, cooldown_minutos, ativo, grupo_id)
  VALUES
    (p_org_id, 'cartao_frota.alterado', 'Cartão de frota alterado',
     'Avisa quando um cartão de combustível muda de titular, estado, plafond ou identificação.',
     'cartao_frota.alterado', '[]'::jsonb, 'notificacao', v_config, 'media', 0, true, v_grupo),
    (p_org_id, 'cartao_frota.alterado.email', 'Cartão de frota alterado (email)',
     'Envia por correio o que a regra cartao_frota.alterado mostra no sino.',
     'cartao_frota.alterado', '[]'::jsonb, 'email', v_config, 'media', 0, true, v_grupo)
  ON CONFLICT (codigo, org_id) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_alerta_cartao_frota_alterado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_alerta_cartao_frota_alterado(uuid) TO service_role;

-- Organizações que já existem.
DO $seed$
DECLARE
  v_org record;
BEGIN
  FOR v_org IN SELECT id FROM public.organizacoes LOOP
    PERFORM public.seed_alerta_cartao_frota_alterado(v_org.id);
  END LOOP;
END;
$seed$;

-- Organizações novas.
CREATE OR REPLACE FUNCTION public.tg_seed_alerta_cartao_frota_alterado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_alerta_cartao_frota_alterado(NEW.id);
  RETURN NULL;
END;
$function$;

-- 'trigger_seed_...' ordena depois de 'trigger_auto_create_admin_cargo' — os
-- AFTER INSERT disparam por ordem alfabética e o cargo tem de existir primeiro
-- (bug de 2026-07-28). Não renomear sem verificar isto.
DROP TRIGGER IF EXISTS trigger_seed_alerta_cartao_frota_alterado ON public.organizacoes;
CREATE TRIGGER trigger_seed_alerta_cartao_frota_alterado
  AFTER INSERT ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_alerta_cartao_frota_alterado();

-- ============================================================================
-- 4. Catálogo: o editor passa a conhecer os campos do evento
-- ============================================================================
-- Redefinição integral da 20260901120000 mais o evento novo. 'accoes' fica
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
