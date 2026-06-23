-- ============================================================
-- Fix título dos eventos de movimento (mesmo bug dos contratos)
-- ============================================================
-- O `movimento_calendario_sync` punha titulo = "Transferência — 26-ZC-03"
-- (verboso). Mas o EventoDialog/Detalhes parseia o `titulo` como matrícula
-- (formatMatricula(titulo)) → "TR-AN-SF-ER-ÊN-CI-A—-26-ZC-03".
--
-- Canónico (igual aos contratos, migration 20260521000003): titulo = só a
-- matrícula. O tipo do evento já é mostrado via coluna `tipo`; o descritivo
-- fica em `descricao` ("Gerado automaticamente pelo movimento #N").
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Cleanup dos eventos de movimento já criados com título verboso
-- ────────────────────────────────────────────────────────────
-- O matricula_devolver tem a matrícula limpa — usamos para repor o título.
UPDATE public.calendario_eventos
   SET titulo = matricula_devolver
 WHERE origem_tipo = 'movimento'
   AND matricula_devolver IS NOT NULL
   AND titulo <> matricula_devolver
   AND titulo LIKE '%—%'; -- formato verboso "Tipo — matrícula"

-- ────────────────────────────────────────────────────────────
-- 2) Recriar a função com titulo = matrícula
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.movimento_calendario_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula text;
  v_titulo text;
  v_tipo_evento text;
  v_data_inicio timestamptz;
  v_data_fim timestamptz;
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

  -- Título canónico = matrícula (o EventoDialog parseia o título como matrícula).
  -- O tipo descritivo vive na coluna `tipo` e em `descricao`.
  v_titulo := COALESCE(v_matricula, 'Movimento #' || NEW.codigo);

  INSERT INTO public.calendario_eventos (
    tipo, titulo, descricao,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, criado_por,
    origem_tipo, origem_id
  )
  VALUES (
    v_tipo_evento,
    v_titulo,
    'Gerado automaticamente pelo movimento #' || NEW.codigo,
    v_data_inicio, v_data_fim, false,
    v_matricula, COALESCE(NEW.created_by, auth.uid()),
    'movimento', NEW.id
  );

  RETURN NEW;
END;
$$;
