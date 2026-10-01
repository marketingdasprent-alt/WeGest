-- ============================================================================
-- Documentos do motorista passam por APROVAÇÃO; envios do motorista avisam a
-- equipa por email (documentos, recibos verdes, fotografia de quilómetros).
-- ============================================================================
--
-- Antes: o motorista gravava em `motorista_documentos` e o backoffice lia isso
-- como fallback — ninguém aprovava nada e a ficha oficial (`motoristas_ativos`)
-- nunca era substituída. Agora:
--
--   1. O que o motorista envia entra como `pendente`. A RLS impede-o de marcar
--      outra coisa.
--   2. Um gestor/admin aprova via RPC; a RPC copia o ficheiro (e a validade,
--      se houver) para a coluna oficial da ficha. Ou rejeita, com motivo.
--   3. Entrada de um pendente gera aviso in-app aos gestores (tipo novo
--      `motorista_documento_pendente`, visível pelo cargo como o de candidatura)
--      e email a gestores + admins + financeiro pela fila que já existe
--      (`notifications` → `notification_queue` → edge `send-notification-queue-email`,
--      cron de 5 em 5 minutos).
--   4. O mesmo email sai quando o motorista submete um recibo verde ou uma
--      fotografia de quilómetros.
--
-- Idempotente e aditiva. Nada é apagado; as linhas antigas ficam `aprovado`
-- (era o que valiam na prática — o BO já as mostrava).
-- ============================================================================

-- ── 1. Estado do documento ─────────────────────────────────────────────────

ALTER TABLE public.motorista_documentos
  ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'aprovado',
  ADD COLUMN IF NOT EXISTS revisto_por     uuid,
  ADD COLUMN IF NOT EXISTS revisto_em      timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'motorista_documentos_status_check'
  ) THEN
    ALTER TABLE public.motorista_documentos
      ADD CONSTRAINT motorista_documentos_status_check
      CHECK (status IN ('pendente', 'aprovado', 'rejeitado'));
  END IF;
END $$;

-- O BO pergunta "há pendentes deste motorista?" a cada abertura da aba.
CREATE INDEX IF NOT EXISTS idx_motorista_documentos_pendentes
  ON public.motorista_documentos (motorista_id)
  WHERE status = 'pendente';

COMMENT ON COLUMN public.motorista_documentos.status IS
  'pendente = enviado pelo motorista, à espera do gestor; aprovado = vale (e, se tiver coluna, foi copiado para a ficha); rejeitado = recusado, ver motivo_rejeicao.';

-- ── 2. RLS: o motorista só cria e só mexe em pendentes ────────────────────
-- As políticas do staff (motoristas_gestao / admin) ficam como estão.

DROP POLICY IF EXISTS "Motorista adiciona os seus documentos" ON public.motorista_documentos;
CREATE POLICY "Motorista adiciona os seus documentos"
  ON public.motorista_documentos
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pendente'
    AND motorista_id IN (
      SELECT id FROM public.motoristas_ativos WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Motorista atualiza os seus documentos" ON public.motorista_documentos;
CREATE POLICY "Motorista atualiza os seus documentos"
  ON public.motorista_documentos
  FOR UPDATE TO authenticated
  USING (
    status = 'pendente'
    AND motorista_id IN (
      SELECT id FROM public.motoristas_ativos WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    status = 'pendente'
    AND motorista_id IN (
      SELECT id FROM public.motoristas_ativos WHERE user_id = (SELECT auth.uid())
    )
  );

-- ── 3. Mapa tipo → coluna da ficha / rótulo ────────────────────────────────
-- O MESMO mapa vive em src/components/motorista-portal/documentosMotorista.ts
-- (TIPOS_DOCUMENTO_MOTORISTA) e no BO. Se um mudar, mudam os três.

CREATE OR REPLACE FUNCTION public.documento_motorista_coluna(
  p_tipo text,
  OUT coluna_url text,
  OUT coluna_validade text
)
RETURNS record
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE p_tipo
      WHEN 'documento_identificacao'       THEN 'documento_ficheiro_url'
      WHEN 'documento_identificacao_verso' THEN 'documento_identificacao_verso_url'
      WHEN 'carta_conducao'                THEN 'carta_ficheiro_url'
      WHEN 'carta_conducao_verso'          THEN 'carta_conducao_verso_url'
      WHEN 'licenca_tvde'                  THEN 'licenca_tvde_ficheiro_url'
      WHEN 'registo_criminal'              THEN 'registo_criminal_url'
      WHEN 'comprovativo_morada'           THEN 'comprovativo_morada_url'
      WHEN 'comprovativo_iban'             THEN 'comprovativo_iban_url'
    END,
    CASE p_tipo
      WHEN 'documento_identificacao'       THEN 'documento_validade'
      WHEN 'documento_identificacao_verso' THEN 'documento_validade'
      WHEN 'carta_conducao'                THEN 'carta_validade'
      WHEN 'carta_conducao_verso'          THEN 'carta_validade'
      WHEN 'licenca_tvde'                  THEN 'licenca_tvde_validade'
    END;
$$;

CREATE OR REPLACE FUNCTION public.documento_motorista_label(p_tipo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tipo
    WHEN 'documento_identificacao'       THEN 'Cartão de Cidadão / Passaporte (frente)'
    WHEN 'documento_identificacao_verso' THEN 'Cartão de Cidadão / Passaporte (verso)'
    WHEN 'carta_conducao'                THEN 'Carta de Condução (frente)'
    WHEN 'carta_conducao_verso'          THEN 'Carta de Condução (verso)'
    WHEN 'licenca_tvde'                  THEN 'Licença TVDE'
    WHEN 'registo_criminal'              THEN 'Registo Criminal'
    WHEN 'comprovativo_morada'           THEN 'Comprovativo de Morada'
    WHEN 'comprovativo_iban'             THEN 'Comprovativo de IBAN'
    ELSE 'Documento'
  END;
$$;

-- ── 4. Quem pode rever ─────────────────────────────────────────────────────
-- Mesma regra que a RLS de `motorista_documentos` já usa para o staff.

CREATE OR REPLACE FUNCTION public.pode_rever_documentos_motorista()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'motoristas_gestao');
$$;

-- ── 5. Aviso in-app: fechar quando não sobra nenhum pendente ──────────────

CREATE OR REPLACE FUNCTION public.fechar_aviso_documentos_pendentes(p_motorista_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link text := '/motoristas/' || p_motorista_id::text || '?tab=documentos';
  v_nome text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.motorista_documentos
    WHERE motorista_id = p_motorista_id AND status = 'pendente'
  ) THEN
    RETURN;
  END IF;

  SELECT nome INTO v_nome FROM public.profiles WHERE id = auth.uid();

  UPDATE public.notificacoes
  SET resolvida = true,
      resolvida_por = auth.uid(),
      resolvida_por_nome = COALESCE(v_nome, 'Sistema'),
      resolvida_em = now()
  WHERE tipo = 'motorista_documento_pendente'
    AND resolvida = false
    AND link = v_link;
END;
$$;

-- ── 6. Aprovar / rejeitar ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.aprovar_documento_motorista(p_documento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc      public.motorista_documentos%ROWTYPE;
  v_col_url  text;
  v_col_val  text;
BEGIN
  IF NOT public.pode_rever_documentos_motorista() THEN
    RAISE EXCEPTION 'Sem permissão para aprovar documentos' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_doc FROM public.motorista_documentos WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_doc.org_id IS NOT NULL AND v_doc.org_id <> public.get_current_org_id() THEN
    RAISE EXCEPTION 'Documento de outra organização' USING ERRCODE = '42501';
  END IF;
  IF v_doc.status <> 'pendente' THEN
    RAISE EXCEPTION 'Este documento já foi revisto (%)', v_doc.status USING ERRCODE = 'P0001';
  END IF;

  SELECT coluna_url, coluna_validade INTO v_col_url, v_col_val
  FROM public.documento_motorista_coluna(v_doc.tipo_documento);

  UPDATE public.motorista_documentos
  SET status = 'aprovado',
      revisto_por = auth.uid(),
      revisto_em = now(),
      motivo_rejeicao = NULL,
      updated_at = now()
  WHERE id = p_documento_id;

  -- É ISTO que substitui o documento na ficha. O ficheiro antigo fica no
  -- storage: apagar um documento oficial por causa de uma aprovação errada
  -- não tem volta.
  IF v_col_url IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.motoristas_ativos SET %I = $1, updated_at = now() WHERE id = $2',
      v_col_url
    ) USING v_doc.ficheiro_url, v_doc.motorista_id;
  END IF;

  IF v_col_val IS NOT NULL AND v_doc.data_validade IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.motoristas_ativos SET %I = $1 WHERE id = $2',
      v_col_val
    ) USING v_doc.data_validade, v_doc.motorista_id;
  END IF;

  PERFORM public.fechar_aviso_documentos_pendentes(v_doc.motorista_id);

  RETURN jsonb_build_object(
    'id', v_doc.id,
    'motorista_id', v_doc.motorista_id,
    'tipo_documento', v_doc.tipo_documento,
    'status', 'aprovado',
    'aplicado_na_ficha', v_col_url IS NOT NULL,
    'coluna', v_col_url
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rejeitar_documento_motorista(p_documento_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.motorista_documentos%ROWTYPE;
BEGIN
  IF NOT public.pode_rever_documentos_motorista() THEN
    RAISE EXCEPTION 'Sem permissão para rejeitar documentos' USING ERRCODE = '42501';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Indique o motivo da rejeição' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_doc FROM public.motorista_documentos WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_doc.org_id IS NOT NULL AND v_doc.org_id <> public.get_current_org_id() THEN
    RAISE EXCEPTION 'Documento de outra organização' USING ERRCODE = '42501';
  END IF;
  IF v_doc.status <> 'pendente' THEN
    RAISE EXCEPTION 'Este documento já foi revisto (%)', v_doc.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.motorista_documentos
  SET status = 'rejeitado',
      motivo_rejeicao = btrim(p_motivo),
      revisto_por = auth.uid(),
      revisto_em = now(),
      updated_at = now()
  WHERE id = p_documento_id;

  PERFORM public.fechar_aviso_documentos_pendentes(v_doc.motorista_id);

  RETURN jsonb_build_object(
    'id', v_doc.id,
    'motorista_id', v_doc.motorista_id,
    'tipo_documento', v_doc.tipo_documento,
    'status', 'rejeitado'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_documento_motorista(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rejeitar_documento_motorista(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_documento_motorista(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rejeitar_documento_motorista(uuid, text) TO authenticated;

-- ── 7. Email à equipa: gestores + admins + financeiro ─────────────────────
-- Escreve nas duas tabelas que a edge `send-notification-queue-email` drena
-- (cron */5). Um `notifications` por pessoa (é a FK da fila) e uma linha na
-- fila com o email dela. O conteúdo vem de `notification_templates` (caminho
-- genérico da edge: assunto + corpo_template com {{variáveis}}); o botão do
-- email leva ao `link`.

CREATE OR REPLACE FUNCTION public.avisar_staff_envio_motorista(
  p_org_id          uuid,
  p_motorista_id    uuid,
  p_template_codigo text,
  p_titulo          text,
  p_mensagem        text,
  p_link            text,
  p_entity_table    text,
  p_entity_id       uuid,
  p_payload         jsonb,
  p_janela          interval DEFAULT interval '10 minutes'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       record;
  v_notif uuid;
  v_n     integer := 0;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Rajada (o motorista anexa 6 documentos seguidos) = 1 email, não 6. O
  -- email é "enviou documentos, vê a ficha"; o detalhe está na ficha.
  IF p_janela IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.notifications
    WHERE org_id = p_org_id
      AND template_codigo = p_template_codigo
      AND link = p_link
      AND created_at > now() - p_janela
  ) THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT DISTINCT p.id AS user_id, p.email
    FROM public.user_organizacoes uo
    JOIN public.profiles p ON p.id = uo.user_id
    LEFT JOIN public.cargos c ON c.id = uo.cargo_id
    WHERE uo.org_id = p_org_id
      AND p.email IS NOT NULL
      AND btrim(p.email) <> ''
      AND (
        COALESCE(uo.is_admin, false)
        OR lower(COALESCE(c.nome, '')) IN (
          'administrador',
          'gestor tvde',
          'supervisor gestor tvde',
          'financeiro',
          'faturação',
          'faturacao'
        )
      )
  LOOP
    INSERT INTO public.notifications
      (org_id, destinatario_user_id, template_codigo, severidade, titulo, mensagem,
       link, entity_table, entity_id, payload)
    VALUES
      (p_org_id, r.user_id, p_template_codigo, 'normal', p_titulo, p_mensagem,
       p_link, p_entity_table, p_entity_id, COALESCE(p_payload, '{}'::jsonb))
    RETURNING id INTO v_notif;

    -- Sem ON CONFLICT: a fila não tem chave única nesse trio, e aqui não há
    -- como colidir — cada `notifications` acabou de nascer nesta iteração.
    INSERT INTO public.notification_queue
      (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
    VALUES
      (v_notif, p_org_id, 'email', r.email, p_template_codigo, COALESCE(p_payload, '{}'::jsonb));

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.avisar_staff_envio_motorista(uuid, uuid, text, text, text, text, text, uuid, jsonb, interval) FROM PUBLIC, anon, authenticated;

-- ── 8. Templates de email (uma linha por organização) ─────────────────────
-- `datasEmPortugues` na edge formata timestamps ISO no corpo; passa-se ISO.

INSERT INTO public.notification_templates
  (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, variaveis_esperadas, versao, ativo)
SELECT
  o.id, t.codigo, 'email', 'pt-PT', t.assunto, t.corpo, 'text', t.vars, 1, true
FROM public.organizacoes o
CROSS JOIN (
  VALUES
    (
      'motorista.documento_enviado',
      '{{motorista_nome}} enviou um documento para aprovação',
      'O motorista {{motorista_nome}} enviou {{documento_label}} ({{nome_ficheiro}}) em {{enviado_em}}. '
      || 'Está pendente de validação: depois de aprovado, substitui o documento actual na ficha.',
      ARRAY['motorista_nome', 'documento_label', 'nome_ficheiro', 'enviado_em']
    ),
    (
      'motorista.recibo_verde_enviado',
      '{{motorista_nome}} submeteu um recibo verde ({{periodo}})',
      'O motorista {{motorista_nome}} submeteu um recibo verde de {{valor}} € referente a {{periodo}}, em {{enviado_em}}. '
      || 'Aguarda validação.',
      ARRAY['motorista_nome', 'periodo', 'valor', 'enviado_em']
    ),
    (
      'motorista.km_enviado',
      '{{motorista_nome}} registou {{km}} km ({{matricula}})',
      'O motorista {{motorista_nome}} fotografou o conta-quilómetros da viatura {{matricula}} em {{enviado_em}}: '
      || '{{km}} km confirmados (leitura automática: {{km_lido}}; anterior: {{km_anterior}}). '
      || 'O KM da viatura foi actualizado.',
      ARRAY['motorista_nome', 'matricula', 'km', 'km_lido', 'km_anterior', 'enviado_em']
    )
) AS t(codigo, assunto, corpo, vars)
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt
  WHERE nt.org_id = o.id AND nt.codigo = t.codigo AND nt.canal = 'email'
);

-- ── 9. Triggers: documento, recibo verde, quilómetros ─────────────────────

CREATE OR REPLACE FUNCTION public.ao_enviar_documento_motorista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m     record;
  v_link  text;
  v_label text;
BEGIN
  IF NEW.status <> 'pendente' THEN
    RETURN NEW;
  END IF;
  -- Substituição do ficheiro de um pendente já avisado: não repete.
  IF TG_OP = 'UPDATE' AND OLD.status = 'pendente' THEN
    RETURN NEW;
  END IF;

  SELECT id, nome, org_id INTO v_m FROM public.motoristas_ativos WHERE id = NEW.motorista_id;
  IF v_m.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_link  := '/motoristas/' || v_m.id::text || '?tab=documentos';
  v_label := public.documento_motorista_label(NEW.tipo_documento);

  -- In-app, para o sino dos gestores. Uma linha por motorista enquanto houver
  -- pendentes (fecha em fechar_aviso_documentos_pendentes).
  IF NOT EXISTS (
    SELECT 1 FROM public.notificacoes
    WHERE tipo = 'motorista_documento_pendente' AND link = v_link AND resolvida = false
  ) THEN
    INSERT INTO public.notificacoes (org_id, tipo, titulo, mensagem, severidade, link)
    VALUES (
      COALESCE(NEW.org_id, v_m.org_id),
      'motorista_documento_pendente',
      'Documento por aprovar',
      COALESCE(v_m.nome, 'Um motorista') || ' enviou ' || v_label || ' e aguarda validação.',
      'normal',
      v_link
    );
  END IF;

  PERFORM public.avisar_staff_envio_motorista(
    COALESCE(NEW.org_id, v_m.org_id),
    v_m.id,
    'motorista.documento_enviado',
    COALESCE(v_m.nome, 'Um motorista') || ' enviou um documento para aprovação',
    v_label || COALESCE(' (' || NEW.nome_ficheiro || ')', ''),
    v_link,
    'motorista_documentos',
    NEW.id,
    jsonb_build_object(
      'motorista_id', v_m.id,
      'motorista_nome', COALESCE(v_m.nome, 'Um motorista'),
      'documento_label', v_label,
      'nome_ficheiro', COALESCE(NEW.nome_ficheiro, 'ficheiro'),
      'enviado_em', COALESCE(NEW.created_at, now())
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ao_enviar_documento_motorista ON public.motorista_documentos;
CREATE TRIGGER trg_ao_enviar_documento_motorista
  AFTER INSERT OR UPDATE OF status ON public.motorista_documentos
  FOR EACH ROW EXECUTE FUNCTION public.ao_enviar_documento_motorista();

CREATE OR REPLACE FUNCTION public.ao_submeter_recibo_verde()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m record;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'recibo' OR NEW.status IS DISTINCT FROM 'submetido' THEN
    RETURN NEW;
  END IF;

  SELECT id, nome, org_id, user_id INTO v_m
  FROM public.motoristas_ativos WHERE id = NEW.motorista_id;
  IF v_m.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só quando é o PRÓPRIO motorista a submeter. O gestor a carregar um recibo
  -- por ele não precisa de um email a dizer-lhe o que acabou de fazer.
  IF v_m.user_id IS NULL OR auth.uid() IS DISTINCT FROM v_m.user_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.avisar_staff_envio_motorista(
    v_m.org_id,
    v_m.id,
    'motorista.recibo_verde_enviado',
    COALESCE(v_m.nome, 'Um motorista') || ' submeteu um recibo verde',
    COALESCE(NEW.periodo_referencia, NEW.descricao, ''),
    '/motoristas/' || v_m.id::text || '?tab=recibos',
    'motorista_recibos',
    NEW.id,
    jsonb_build_object(
      'motorista_id', v_m.id,
      'motorista_nome', COALESCE(v_m.nome, 'Um motorista'),
      'periodo', COALESCE(NEW.periodo_referencia, NEW.descricao, '—'),
      'valor', to_char(COALESCE(NEW.valor_total, 0), 'FM999G999G990D00'),
      'enviado_em', COALESCE(NEW.created_at, now())
    ),
    NULL  -- sem janela: um recibo por semana, cada um conta
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ao_submeter_recibo_verde ON public.motorista_recibos;
CREATE TRIGGER trg_ao_submeter_recibo_verde
  AFTER INSERT ON public.motorista_recibos
  FOR EACH ROW EXECUTE FUNCTION public.ao_submeter_recibo_verde();

CREATE OR REPLACE FUNCTION public.ao_registar_km_motorista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m         record;
  v_matricula text;
BEGIN
  IF NEW.origem IS DISTINCT FROM 'motorista_portal' OR NEW.motorista_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, nome, org_id INTO v_m FROM public.motoristas_ativos WHERE id = NEW.motorista_id;
  IF v_m.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;

  PERFORM public.avisar_staff_envio_motorista(
    v_m.org_id,
    v_m.id,
    'motorista.km_enviado',
    COALESCE(v_m.nome, 'Um motorista') || ' registou ' || NEW.km_confirmado::text || ' km',
    COALESCE(v_matricula, 'viatura'),
    '/viaturas/' || NEW.viatura_id::text,
    'viatura_km_leituras',
    NEW.id,
    jsonb_build_object(
      'motorista_id', v_m.id,
      'motorista_nome', COALESCE(v_m.nome, 'Um motorista'),
      'matricula', COALESCE(v_matricula, '—'),
      'km', NEW.km_confirmado,
      'km_lido', COALESCE(NEW.km_lido::text, '—'),
      'km_anterior', COALESCE(NEW.km_anterior::text, '—'),
      'enviado_em', COALESCE(NEW.created_at, now())
    ),
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ao_registar_km_motorista ON public.viatura_km_leituras;
CREATE TRIGGER trg_ao_registar_km_motorista
  AFTER INSERT ON public.viatura_km_leituras
  FOR EACH ROW EXECUTE FUNCTION public.ao_registar_km_motorista();

-- ── 10. RLS de `notificacoes`: o tipo novo é visto pelos mesmos cargos que
--        vêem as candidaturas pendentes. Recriada a política, com o tipo a mais.

DROP POLICY IF EXISTS "ver notificacoes do meu cargo" ON public.notificacoes;
CREATE POLICY "ver notificacoes do meu cargo"
  ON public.notificacoes
  FOR SELECT
  USING (
    org_id = public.get_current_org_id()
    AND (
      (
        tipo IN ('motorista_pendente', 'motorista_documento_pendente')
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
        tipo NOT IN ('motorista_pendente', 'motorista_documento_pendente', 'escalonamento', 'pedido_troca_kms')
        AND destinatario_id = auth.uid()
      )
    )
  );

NOTIFY pgrst, 'reload schema';
