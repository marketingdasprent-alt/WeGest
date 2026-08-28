-- ============================================================
-- Preencher cidade (estação) nos eventos gerados por movimentos
-- ============================================================
-- Mesmo bug do 20260703000001 (contrato_renting), agora no
-- movimento_calendario_sync: calendario_eventos.cidade nunca era
-- preenchida a partir de movimentos.estacao_destino_id / estacao_origem_id.
--
-- Regra: usa a estação de destino (onde a viatura fica/chega). Se o
-- movimento não tiver destino (ex.: reparação/manutenção só regista
-- origem), usa a estação de origem como fallback.
--
-- Idempotente: CREATE OR REPLACE. Backfill só toca eventos com
-- cidade IS NULL e origem_tipo='movimento'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.movimento_calendario_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula     text;
  v_titulo        text;
  v_tipo_evento   text;
  v_data_inicio   timestamptz;
  v_data_fim      timestamptz;
  v_cidade        text;
  v_estacao_id    uuid;
BEGIN
  -- Movimentos sem viatura nem datas não geram evento
  IF NEW.viatura_id IS NULL AND NEW.matricula IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.data_partida IS NULL AND NEW.data_chegada IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotência — não duplicar evento para o mesmo movimento
  IF EXISTS (
    SELECT 1 FROM public.calendario_eventos
     WHERE origem_tipo = 'movimento' AND origem_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Matrícula: usa snapshot do movimento, fallback à viatura
  v_matricula := NEW.matricula;
  IF v_matricula IS NULL AND NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
  END IF;

  v_tipo_evento := NEW.tipo;

  v_data_inicio := COALESCE(NEW.data_partida, NEW.data_chegada);
  v_data_fim := COALESCE(NEW.data_chegada, NEW.data_partida);

  -- Cidade: estação de destino (onde a viatura fica), fallback à origem
  v_estacao_id := COALESCE(NEW.estacao_destino_id, NEW.estacao_origem_id);
  IF v_estacao_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(cidade), ''), nome) INTO v_cidade
      FROM public.estacoes WHERE id = v_estacao_id;
  END IF;

  -- Título canónico = matrícula (o EventoDialog parseia o título como matrícula).
  -- O tipo descritivo vive na coluna `tipo` e em `descricao`.
  v_titulo := COALESCE(v_matricula, 'Movimento #' || NEW.codigo);

  INSERT INTO public.calendario_eventos (
    tipo, titulo, descricao, cidade,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, criado_por,
    origem_tipo, origem_id
  )
  VALUES (
    v_tipo_evento,
    v_titulo,
    'Gerado automaticamente pelo movimento #' || NEW.codigo,
    v_cidade,
    v_data_inicio, v_data_fim, false,
    v_matricula, COALESCE(NEW.created_by, auth.uid()),
    'movimento', NEW.id
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.movimento_calendario_sync() IS
  'Cria evento de calendário ao inserir movimento, incluindo a cidade da estação de destino (fallback origem). Idempotente por (origem_tipo, origem_id).';

-- ------------------------------------------------------------
-- Backfill: preencher cidade nos eventos de movimento já
-- existentes que ainda não a têm.
-- ------------------------------------------------------------
UPDATE public.calendario_eventos ce
   SET cidade = est.cidade_resolvida
  FROM (
    SELECT
      m.id,
      COALESCE(NULLIF(TRIM(e.cidade), ''), e.nome) AS cidade_resolvida
    FROM public.movimentos m
    JOIN public.estacoes e
      ON e.id = COALESCE(m.estacao_destino_id, m.estacao_origem_id)
  ) est
 WHERE ce.origem_tipo = 'movimento'
   AND ce.origem_id   = est.id
   AND ce.cidade IS NULL;
