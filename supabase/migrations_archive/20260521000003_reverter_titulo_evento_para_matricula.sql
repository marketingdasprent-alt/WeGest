-- ============================================================
-- Eventos gerados pela cascata preenchem as colunas correctas
-- ============================================================
-- Bug 1: a migration 20260520600001 mudou o título para
-- "{matricula} {NOME_ESTACAO}". Mas o EventoDialog parseia o
-- `titulo` como matrícula (formatMatricula(evento.titulo)).
-- Resultado: "26-ZC-03 LEIRIA" vira "EN-TR-EG-A--26-ZC-03..."
--
-- Bug 2: o trigger não preenchia `cidade` nem `motorista_id`,
-- deixando o formulário de evento sem contexto. A estação fica
-- só no contrato e tem que ser inferida — o que duplica trabalho.
--
-- Esta migration corrige ambos:
--   • titulo = matrícula (formato canónico legacy)
--   • cidade = estacoes.cidade (fallback: estacoes.nome)
--   • motorista_id = condutor principal (TVDE) ou NULL
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Cleanup dos eventos já criados pelo trigger bugado
-- ────────────────────────────────────────────────────────────
UPDATE public.calendario_eventos
   SET titulo = matricula_devolver
 WHERE origem_tipo = 'contrato_renting'
   AND matricula_devolver IS NOT NULL
   AND titulo <> matricula_devolver
   AND titulo LIKE '% %'; -- só os que têm espaço (formato verboso)

-- ────────────────────────────────────────────────────────────
-- 2) Recriar a função com as colunas certas preenchidas
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula           text;
  v_cidade_entrega      text;
  v_cidade_recolha      text;
  v_motorista_id        uuid;
  v_titulo              text;
BEGIN
  IF NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
  END IF;

  -- Cidade = estacoes.cidade; fallback para estacoes.nome se a primeira é NULL
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

  -- Motorista_id só em TVDE: condutor principal que seja motorista parceiro
  IF NEW.regime = 'tvde' THEN
    SELECT motorista_id INTO v_motorista_id
      FROM public.contrato_condutores
     WHERE contrato_id = NEW.id
       AND is_principal = true
       AND motorista_id IS NOT NULL
     LIMIT 1;
  END IF;

  -- Reserva → em_curso
  IF NEW.reserva_id IS NOT NULL THEN
    UPDATE public.reservas
       SET estado = 'em_curso'
     WHERE id = NEW.reserva_id
       AND estado IN ('confirmada', 'pendente');
  END IF;

  -- Título canónico = matrícula (legacy: EventoDialog parseia título como matrícula)
  v_titulo := COALESCE(v_matricula, 'Contrato #' || NEW.codigo);

  -- Evento de entrega
  INSERT INTO public.calendario_eventos (
    tipo, titulo, descricao, cidade,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, motorista_id, criado_por,
    origem_tipo, origem_id
  )
  VALUES (
    'entrega',
    v_titulo,
    'Gerado automaticamente pelo contrato #' || NEW.codigo,
    v_cidade_entrega,
    NEW.data_inicio, NEW.data_inicio, false,
    v_matricula, v_motorista_id, COALESCE(NEW.created_by, auth.uid()),
    'contrato_renting', NEW.id
  );

  -- Evento de recolha (só se data_fim definida)
  IF NEW.data_fim IS NOT NULL THEN
    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao, cidade,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, motorista_id, criado_por,
      origem_tipo, origem_id
    )
    VALUES (
      'recolha',
      v_titulo,
      'Gerado automaticamente pelo contrato #' || NEW.codigo,
      v_cidade_recolha,
      NEW.data_fim, NEW.data_fim, false,
      v_matricula, v_motorista_id, COALESCE(NEW.created_by, auth.uid()),
      'contrato_renting', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3) Backfill `cidade` nos eventos já existentes
-- ────────────────────────────────────────────────────────────
-- Os eventos antigos foram criados sem cidade. Dois UPDATEs
-- separados — Postgres não permite referenciar a tabela alvo (`e`)
-- na condição de JOIN do FROM.

-- 3a) Eventos de entrega → estacao_entrega
UPDATE public.calendario_eventos e
   SET cidade = COALESCE(NULLIF(trim(est.cidade), ''), est.nome)
  FROM public.contratos_renting c
  JOIN public.estacoes est ON est.id = c.estacao_entrega_id
 WHERE e.origem_tipo = 'contrato_renting'
   AND e.origem_id = c.id
   AND e.tipo = 'entrega'
   AND (e.cidade IS NULL OR e.cidade = '');

-- 3b) Eventos de recolha → estacao_recolha
UPDATE public.calendario_eventos e
   SET cidade = COALESCE(NULLIF(trim(est.cidade), ''), est.nome)
  FROM public.contratos_renting c
  JOIN public.estacoes est ON est.id = c.estacao_recolha_id
 WHERE e.origem_tipo = 'contrato_renting'
   AND e.origem_id = c.id
   AND e.tipo = 'recolha'
   AND (e.cidade IS NULL OR e.cidade = '');

-- ────────────────────────────────────────────────────────────
-- 4) Backfill `motorista_id` nos eventos TVDE já existentes
-- ────────────────────────────────────────────────────────────
UPDATE public.calendario_eventos e
   SET motorista_id = cc.motorista_id
  FROM public.contratos_renting c
  JOIN public.contrato_condutores cc
    ON cc.contrato_id = c.id
   AND cc.is_principal = true
   AND cc.motorista_id IS NOT NULL
 WHERE e.origem_tipo = 'contrato_renting'
   AND e.origem_id = c.id
   AND c.regime = 'tvde'
   AND e.motorista_id IS NULL;
