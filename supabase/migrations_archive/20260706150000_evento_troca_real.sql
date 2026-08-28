-- ============================================================
-- Evento de calendário 'troca' real e accionável (mesmo grupo)
-- ============================================================
-- Pedido do dono do produto (2026-07-06): quando o gestor troca a viatura
-- dum contrato por outra do MESMO grupo tarifário, o calendário deve gerar
-- um único evento tipo='troca' (já aceite pela CHECK constraint desde
-- 20260629000004, mas órfão desde 20260703000005). Upgrade/downgrade
-- (grupo diferente) continua a gerar recolha+entrega separados — são
-- fisicamente duas entregas distintas em momentos que podem divergir.
--
-- 'troca' é sempre AGORA (data_inicio=data_fim=now()): o gestor já tem as
-- duas viaturas fisicamente presentes ao confirmar a troca no contrato.
-- Continua a gerar a recolha final da viatura nova na data_fim do contrato.
--
-- Realização: 'troca' NÃO mapeia para estado_operacional (o contrato
-- mantém-se em_curso — só upgrade='entrega'/'recolha' tocam nesse enum).
-- motorista_viaturas já foi sincronizado no momento da própria troca (via
-- trg_contrato_renting_liga_motorista_open/close, disparado pelo UPDATE
-- de viatura_id) — a realização do evento 'troca' é só o registo físico
-- (km, combustível, danos, assinaturas), por isso tem RPC própria que
-- apenas marca realizado_em/realizado_por_id.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_versao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula_nova    text;
  v_matricula_antiga  text;
  v_cidade_entrega    text;
  v_cidade_recolha    text;
  v_mesmo_grupo       boolean;
BEGIN
  -- ──────────────────────────────────────────────────────────
  -- Caso 1: contrato substituído → apagar eventos pendentes
  -- ──────────────────────────────────────────────────────────
  IF OLD.substituido_em IS NULL AND NEW.substituido_em IS NOT NULL THEN
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id   = NEW.id
       AND tipo IN ('entrega', 'recolha', 'troca');
    RETURN NEW;
  END IF;

  -- ──────────────────────────────────────────────────────────
  -- Caso 2: viatura mudou numa versão > 1 → troca/upgrade/downgrade
  -- ──────────────────────────────────────────────────────────
  IF NEW.contrato_anterior_id IS NOT NULL
     AND NEW.substituido_em IS NULL
     AND OLD.viatura_id IS DISTINCT FROM NEW.viatura_id
  THEN
    SELECT matricula INTO v_matricula_nova
      FROM public.viaturas WHERE id = NEW.viatura_id;
    v_matricula_antiga := OLD.matricula;

    -- Mesmo grupo (snapshot texto do contrato) = troca simples.
    -- Grupo diferente = upgrade/downgrade — mantém recolha+entrega.
    v_mesmo_grupo := NEW.grupo IS NOT DISTINCT FROM OLD.grupo;

    IF NEW.estacao_entrega_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(trim(cidade), ''), nome)
        INTO v_cidade_entrega
        FROM public.estacoes WHERE id = NEW.estacao_entrega_id;
    END IF;
    IF NEW.estacao_recolha_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(trim(cidade), ''), nome)
        INTO v_cidade_recolha
        FROM public.estacoes WHERE id = NEW.estacao_recolha_id;
    END IF;

    -- 1) Apagar eventos entrega/recolha/troca desta versão (criados pelo
    --    cascata_open com a viatura antiga ao clonar)
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id   = NEW.id
       AND tipo IN ('entrega', 'recolha', 'troca');

    IF v_mesmo_grupo THEN
      -- 2a) Troca simples: um único evento accionável.
      INSERT INTO public.calendario_eventos (
        tipo, titulo, descricao, cidade,
        data_inicio, data_fim, dia_todo,
        matricula_devolver, criado_por,
        origem_tipo, origem_id
      )
      VALUES (
        'troca',
        COALESCE(v_matricula_nova, '?'),
        'Troca de viatura no contrato #' || NEW.codigo,
        COALESCE(v_cidade_entrega, v_cidade_recolha),
        now(), now(), false,
        v_matricula_antiga, COALESCE(NEW.updated_by, auth.uid()),
        'contrato_renting', NEW.id
      );
    ELSE
      -- 2b) Upgrade/downgrade: recolha da antiga + entrega da nova.
      INSERT INTO public.calendario_eventos (
        tipo, titulo, descricao, cidade,
        data_inicio, data_fim, dia_todo,
        matricula_devolver, criado_por,
        origem_tipo, origem_id
      )
      VALUES (
        'recolha',
        COALESCE(v_matricula_antiga, '?'),
        'Troca de viatura no contrato #' || NEW.codigo || ' — devolução da viatura anterior',
        v_cidade_recolha,
        now(), now(), false,
        v_matricula_antiga, COALESCE(NEW.updated_by, auth.uid()),
        'contrato_renting', NEW.id
      );

      INSERT INTO public.calendario_eventos (
        tipo, titulo, descricao, cidade,
        data_inicio, data_fim, dia_todo,
        matricula_devolver, criado_por,
        origem_tipo, origem_id
      )
      VALUES (
        'entrega',
        COALESCE(v_matricula_nova, '?'),
        'Troca de viatura no contrato #' || NEW.codigo || ' — entrega da nova viatura',
        v_cidade_entrega,
        now(), now(), false,
        v_matricula_nova, COALESCE(NEW.updated_by, auth.uid()),
        'contrato_renting', NEW.id
      );
    END IF;

    -- 3) Recolha final da viatura nova na data_fim do contrato (se definida)
    IF NEW.data_fim IS NOT NULL THEN
      INSERT INTO public.calendario_eventos (
        tipo, titulo, descricao, cidade,
        data_inicio, data_fim, dia_todo,
        matricula_devolver, criado_por,
        origem_tipo, origem_id
      )
      VALUES (
        'recolha',
        v_matricula_nova,
        'Gerado automaticamente pelo contrato #' || NEW.codigo,
        v_cidade_recolha,
        NEW.data_fim, NEW.data_fim, false,
        v_matricula_nova, COALESCE(NEW.updated_by, auth.uid()),
        'contrato_renting', NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_versao() IS
  'Cascateia o versionamento de contratos para o calendário: apaga eventos da '
  'versão substituída e cria, conforme mesmo grupo (OLD.grupo=NEW.grupo) ou não, '
  'um único evento troca (accionável) OU recolha+entrega separados (upgrade/downgrade). '
  'Mantém a recolha final da viatura nova na data_fim do contrato.';

-- ============================================================
-- Tokens de realização: aceitar tipo 'troca'
-- ============================================================
ALTER TABLE public.realizacao_tokens
  DROP CONSTRAINT IF EXISTS realizacao_tokens_tipo_check;

ALTER TABLE public.realizacao_tokens
  ADD CONSTRAINT realizacao_tokens_tipo_check
  CHECK (tipo IN ('entrega', 'recolha', 'troca'));

CREATE OR REPLACE FUNCTION public.gerar_token_realizacao(
  p_evento_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento     calendario_eventos%ROWTYPE;
  v_contrato_id uuid;
  v_token_id   uuid;
BEGIN
  SELECT * INTO v_evento FROM public.calendario_eventos WHERE id = p_evento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento % não encontrado.', p_evento_id;
  END IF;

  IF v_evento.origem_tipo <> 'contrato_renting' THEN
    RAISE EXCEPTION 'Evento não vem de contrato de renting.';
  END IF;

  IF v_evento.tipo NOT IN ('entrega', 'recolha', 'troca') THEN
    RAISE EXCEPTION 'Apenas eventos de entrega/recolha/troca podem ser pareados.';
  END IF;

  IF v_evento.realizado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este evento já foi realizado.';
  END IF;

  v_contrato_id := v_evento.origem_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.contratos_renting
     WHERE id = v_contrato_id AND org_id = get_current_org_id()
  ) THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;

  INSERT INTO public.realizacao_tokens (
    org_id, evento_id, contrato_id, tipo, created_by
  )
  VALUES (
    get_current_org_id(), v_evento.id, v_contrato_id, v_evento.tipo, auth.uid()
  )
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

COMMENT ON FUNCTION public.gerar_token_realizacao(uuid) IS
  'Cria token de deep-link para realizar entrega/recolha/troca dum evento de contrato_renting.';

-- ============================================================
-- Realizar troca: marca o evento realizado SEM tocar estado_operacional
-- ============================================================
-- Distinto de realizar_token_realizacao (entrega/recolha) porque a troca
-- não corresponde a nenhuma transição do enum estado_operacional — o
-- contrato já está em_curso antes e depois. Faria RAISE EXCEPTION
-- 'Tipo de token inesperado' na função antiga; em vez de sobrecarregar o
-- CASE ali com um branch NULL-safe, cria-se função dedicada — o efeito
-- (marcar realizado) é conceptualmente diferente do que as outras duas
-- fazem (mudar estado do contrato).
CREATE OR REPLACE FUNCTION public.realizar_token_realizacao(
  p_token uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token       realizacao_tokens%ROWTYPE;
  v_evento      calendario_eventos%ROWTYPE;
  v_novo_estado text;
  v_actor       uuid;
BEGIN
  SELECT * INTO v_token
    FROM public.realizacao_tokens
   WHERE id = p_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido.';
  END IF;
  IF v_token.expires_at < now() THEN
    RAISE EXCEPTION 'Token expirado.';
  END IF;
  IF v_token.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Token já foi usado.';
  END IF;
  IF v_token.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Token de outra organização.';
  END IF;

  SELECT * INTO v_evento FROM public.calendario_eventos WHERE id = v_token.evento_id;
  IF v_evento.realizado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Evento já realizado.';
  END IF;

  v_actor := COALESCE(auth.uid(), v_token.created_by);

  IF v_token.tipo = 'troca' THEN
    -- Troca não muda estado_operacional do contrato — marca o evento
    -- directamente, sem passar pelo trigger de cascata de estado.
    UPDATE public.calendario_eventos
       SET realizado_em     = now(),
           realizado_por_id = v_actor
     WHERE id = v_token.evento_id;

    UPDATE public.realizacao_tokens
       SET used_at = now()
     WHERE id = v_token.id;

    RETURN;
  END IF;

  v_novo_estado := CASE v_token.tipo
    WHEN 'entrega' THEN 'em_curso'
    WHEN 'recolha' THEN 'devolvido'
  END;
  IF v_novo_estado IS NULL THEN
    RAISE EXCEPTION 'Tipo de token inesperado: %.', v_token.tipo;
  END IF;

  -- Muda o estado do contrato. Dispara trg_contrato_renting_cascata_realizacao,
  -- que marca o evento correspondente como realizado.
  UPDATE public.contratos_renting
     SET estado_operacional = v_novo_estado::contrato_estado_operacional_enum,
         updated_by         = v_actor
   WHERE id = v_token.contrato_id;

  UPDATE public.realizacao_tokens
     SET used_at = now()
   WHERE id = v_token.id;
END;
$$;

COMMENT ON FUNCTION public.realizar_token_realizacao(uuid) IS
  'Confirma entrega/recolha (muda estado_operacional, dispara cascata) ou troca '
  '(marca o evento realizado directamente, sem tocar estado_operacional — o '
  'contrato mantém-se em_curso durante toda a troca).';
