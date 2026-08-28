-- ============================================================
-- Restaura origem_tipo/origem_id nos eventos gerados pelo contrato
-- ============================================================
-- Regressão introduzida em 20260612000003 (evento_titulo_apenas_matricula):
-- ao recriar contrato_renting_cascata_open para corrigir o título, os INSERT
-- de entrega/recolha deixaram de gravar origem_tipo='contrato_renting' e
-- origem_id=NEW.id (que a versão 20260520300002 gravava).
--
-- Vários consumidores filtram por essas colunas e ficaram partidos:
--   • contrato_renting_cascata_versao apaga entrega/recolha por origem_tipo/id;
--   • cascata_estado / realização filtram igual;
--   • gerar_token_realizacao exige origem_tipo='contrato_renting';
--   • ContratoForm procura o evento pendente por origem_tipo/origem_id.
-- Resultado: eventos de contratos novos ficavam órfãos; ao versionar (troca de
-- viatura) os eventos antigos não eram apagados e a realização não os encontrava.
--
-- Correção:
--   1. Recria a função preservando o título = matrícula normalizada (e a
--      descrição via observacoes_internas, da 20260612000003) E voltando a
--      gravar origem_tipo/origem_id.
--   2. Backfill conservador dos eventos órfãos (origem_tipo IS NULL) gerados
--      por contratos, associando entrega↔data_inicio e recolha↔data_fim pela
--      matrícula. Só associa quando o matching é ÚNICO (1 contrato por evento) —
--      evita falsos positivos quando há contratos com a mesma viatura/datas.
--
-- Idempotente: CREATE OR REPLACE; ADD COLUMN IF NOT EXISTS; UPDATE com guarda
-- origem_tipo IS NULL (após correr deixa de aplicar) e n_contratos = 1.
-- ============================================================

-- Defensivo — as colunas já existem desde 20260520300002, mas garantir.
ALTER TABLE public.calendario_eventos
  ADD COLUMN IF NOT EXISTS origem_tipo text,
  ADD COLUMN IF NOT EXISTS origem_id uuid;

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula text;
  v_cliente_nome text;
  v_descricao text;
BEGIN
  -- Snapshot de dados úteis para o evento de calendário
  IF NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
    v_matricula := UPPER(REGEXP_REPLACE(v_matricula, '[\s-]', '', 'g'));
  END IF;
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = NEW.cliente_id;
  END IF;

  -- Descrição: observacoes_internas se preenchido, senão texto automático.
  v_descricao := COALESCE(NULLIF(TRIM(NEW.observacoes_internas), ''), 'Gerado automaticamente pelo contrato #' || NEW.codigo);

  -- 1. Reserva → em_curso (se contrato foi gerado a partir de reserva)
  IF NEW.reserva_id IS NOT NULL THEN
    UPDATE public.reservas
       SET estado = 'em_curso'
     WHERE id = NEW.reserva_id
       AND estado IN ('confirmada', 'pendente');
  END IF;

  -- (viaturas.status é tratado por trg_contratos_disponibilidade →
  --  recalcular_disponibilidade_viatura, que corre logo após este trigger.)

  -- 2. Evento de entrega (data_inicio do contrato)
  INSERT INTO public.calendario_eventos (
    tipo, titulo, descricao,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, criado_por,
    origem_tipo, origem_id
  )
  VALUES (
    'entrega',
    COALESCE(v_matricula, '?'),
    v_descricao,
    NEW.data_inicio, NEW.data_inicio, false,
    v_matricula, COALESCE(NEW.created_by, auth.uid()),
    'contrato_renting', NEW.id
  );

  -- 3. Evento de recolha (data_fim do contrato — se existir)
  IF NEW.data_fim IS NOT NULL THEN
    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por,
      origem_tipo, origem_id
    )
    VALUES (
      'recolha',
      COALESCE(v_matricula, '?'),
      v_descricao,
      NEW.data_fim, NEW.data_fim, false,
      v_matricula, COALESCE(NEW.created_by, auth.uid()),
      'contrato_renting', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_open() IS
  'Cascata ao criar contrato_renting: avança reserva, ocupa viatura, gera eventos no calendário com origem_tipo/origem_id. titulo = matrícula normalizada; descrição usa observacoes_internas quando preenchido.';

-- ------------------------------------------------------------
-- Backfill conservador dos eventos órfãos gerados por contratos.
-- Associa entrega↔data_inicio e recolha↔data_fim pela matrícula normalizada.
-- Só quando há exactamente 1 contrato candidato por evento (n_contratos = 1).
-- ------------------------------------------------------------
WITH candidatos AS (
  SELECT
    ce.id AS evento_id,
    c.id  AS contrato_id,
    COUNT(*) OVER (PARTITION BY ce.id) AS n_contratos
  FROM public.calendario_eventos ce
  JOIN public.contratos_renting c
    ON c.deleted_at IS NULL
   AND (
        (ce.tipo = 'entrega' AND ce.data_inicio = c.data_inicio)
     OR (ce.tipo = 'recolha' AND ce.data_inicio = c.data_fim)
   )
   AND ce.matricula_devolver = UPPER(REGEXP_REPLACE(COALESCE(c.matricula, ''), '[\s-]', '', 'g'))
  WHERE ce.origem_tipo IS NULL
    AND ce.tipo IN ('entrega', 'recolha')
    AND ce.matricula_devolver IS NOT NULL
)
UPDATE public.calendario_eventos ce
   SET origem_tipo = 'contrato_renting',
       origem_id   = cand.contrato_id
  FROM candidatos cand
 WHERE ce.id = cand.evento_id
   AND cand.n_contratos = 1;
