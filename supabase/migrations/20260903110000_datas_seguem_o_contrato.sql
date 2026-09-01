-- ============================================================================
-- As datas seguem o contrato, e o dinheiro sem dono fica à vista.
--
-- PORQUÊ
-- Um contrato criado com início retroactivo (transferência entre empresas,
-- regularização de um atraso) guardava a data certa em `contratos_renting`,
-- mas a ligação condutor–contrato ficava carimbada com a data de HOJE. O
-- fecho de período resolve o condutor por `contrato_condutores`, filtrando
-- pelas datas dessa ligação: um contrato a começar a 24/08 com a ligação a
-- dizer 01/09 fazia o motorista desaparecer do fecho das semanas anteriores,
-- em silêncio.
--
-- Caso real: Paulo André Antunes Badalo, contrato #16 da PREMIUM RIDE,
-- 24/08→23/09 a 275,00 €/semana. 181 ligações estavam no mesmo estado.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--   1. Impede o estado inválido: uma ligação condutor–contrato nunca começa
--      antes do contrato, e quando é a única do contrato herda a data dele.
--   2. Corrige as ligações já desalinhadas que NÃO tocam em semanas fechadas.
--   3. Cria `v_dinheiro_sem_dono`, para estes casos passarem a ser vistos
--      antes de alguém reclamar, e não semanas depois.
--
-- Idempotente e aditiva: pode correr mais do que uma vez.
-- ============================================================================

-- ─── 1. O estado inválido deixa de entrar ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_condutor_segue_o_contrato()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contrato_inicio timestamptz;
  v_outros integer;
BEGIN
  SELECT data_inicio INTO v_contrato_inicio
  FROM public.contratos_renting WHERE id = NEW.contrato_id;

  IF v_contrato_inicio IS NULL THEN
    RETURN NEW;
  END IF;

  -- Uma ligação nunca começa ANTES do contrato que a justifica: isso não é
  -- uma troca de condutor, é dados partidos.
  IF NEW.data_inicio IS NOT NULL AND NEW.data_inicio < v_contrato_inicio THEN
    NEW.data_inicio := v_contrato_inicio;
  END IF;

  -- Sem data, ou com data depois do contrato: se este é o ÚNICO condutor do
  -- contrato, ele conduz desde o início — herda a data. Havendo outros, é uma
  -- troca de condutor a meio e a data mais tardia é legítima; não se toca.
  SELECT count(*) INTO v_outros
  FROM public.contrato_condutores
  WHERE contrato_id = NEW.contrato_id
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF v_outros = 0 AND (NEW.data_inicio IS NULL OR NEW.data_inicio > v_contrato_inicio) THEN
    NEW.data_inicio := v_contrato_inicio;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS condutor_segue_o_contrato ON public.contrato_condutores;
CREATE TRIGGER condutor_segue_o_contrato
  BEFORE INSERT OR UPDATE OF data_inicio, contrato_id ON public.contrato_condutores
  FOR EACH ROW EXECUTE FUNCTION public.tg_condutor_segue_o_contrato();

-- ─── 2. Corrigir o que já está desalinhado ──────────────────────────────────
--
-- Só onde é inequívoco e não mexe em dinheiro já fechado:
--   · o contrato tem UM único condutor (não é troca de condutor);
--   · não existe nenhum fecho gravado nas semanas que passariam a ser
--     cobertas. Onde existe, a correcção mudaria valores já apresentados ao
--     motorista — essas ficam de fora, para decisão caso a caso.

WITH contagem AS (
  SELECT contrato_id, count(*) AS n
  FROM public.contrato_condutores
  GROUP BY contrato_id
), alvo AS (
  SELECT cc.id AS cc_id, ct.data_inicio AS nova_data
  FROM public.contratos_renting ct
  JOIN public.contrato_condutores cc ON cc.contrato_id = ct.id
  JOIN contagem g ON g.contrato_id = ct.id AND g.n = 1
  WHERE ct.deleted_at IS NULL
    AND ct.estado_operacional <> 'cancelado'
    AND cc.data_inicio::date > ct.data_inicio::date
    AND NOT EXISTS (
      SELECT 1 FROM public.motorista_resumo_semanal r
      WHERE r.motorista_id = cc.motorista_id
        AND r.semana_inicio < cc.data_inicio::date
        AND r.semana_fim >= ct.data_inicio::date
    )
)
UPDATE public.contrato_condutores cc
SET data_inicio = a.nova_data
FROM alvo a
WHERE cc.id = a.cc_id;

-- ─── 3. O dinheiro sem dono passa a ser uma lista ───────────────────────────
--
-- Tudo o que, neste momento, é dinheiro que o sistema não sabe a quem
-- imputar — ou que imputa a alguém mas nenhum ecrã mostra. Uma linha aqui é
-- sempre um erro por resolver.

CREATE OR REPLACE VIEW public.v_dinheiro_sem_dono AS

-- Ganhos de plataforma sem motorista resolvido: ninguém os vê, ninguém os
-- cobra, e o fecho não os apanha.
SELECT
  'ganhos_uber_sem_motorista'::text AS problema,
  u.org_id,
  u.uber_driver_id::text            AS referencia,
  u.motorista_nome                  AS detalhe,
  u.ganhos_brutos                   AS valor,
  u.periodo_inicio,
  u.periodo_fim
FROM public.uber_resumos_semanais u
WHERE u.motorista_id IS NULL
  AND u.periodo_inicio >= current_date - 90

UNION ALL

SELECT
  'ganhos_bolt_sem_motorista',
  b.org_id,
  b.identificador_motorista::text,
  b.motorista_nome,
  b.ganhos_liquidos,
  b.periodo_inicio,
  b.periodo_fim
FROM public.bolt_resumos_semanais b
WHERE b.motorista_id IS NULL
  AND b.periodo_inicio >= current_date - 90

UNION ALL

-- Ligações condutor–contrato que começam depois do contrato: o fecho não vê
-- o motorista nas semanas anteriores e não lhe cobra nada.
SELECT
  'condutor_comeca_depois_do_contrato',
  ct.org_id,
  ct.codigo::text,
  m.nome,
  ct.valor_total_manual,
  ct.data_inicio::date,
  cc.data_inicio::date
FROM public.contratos_renting ct
JOIN public.contrato_condutores cc ON cc.contrato_id = ct.id
LEFT JOIN public.motoristas_ativos m ON m.id = cc.motorista_id
WHERE ct.deleted_at IS NULL
  AND ct.estado_operacional <> 'cancelado'
  AND cc.data_inicio::date > ct.data_inicio::date

UNION ALL

-- Débitos de renda lançados à mão em semanas sem contrato a cobri-las. O
-- resumo ignora-os de propósito (o aluguer vem do contrato) — sem contrato,
-- o valor não aparece em lado nenhum. Foi assim que 225,00 € do Paulo
-- ficaram invisíveis.
SELECT
  'renda_lancada_sem_contrato',
  f.org_id,
  f.id::text,
  m.nome,
  f.valor,
  f.data_movimento,
  f.data_movimento
FROM public.motorista_financeiro f
LEFT JOIN public.motoristas_ativos m ON m.id = f.motorista_id
WHERE f.categoria = 'renda_viatura'
  AND f.tipo = 'debito'
  AND f.status <> 'cancelado'
  AND f.data_movimento >= current_date - 90
  AND NOT EXISTS (
    SELECT 1
    FROM public.contrato_condutores cc
    JOIN public.contratos_renting ct ON ct.id = cc.contrato_id
    WHERE cc.motorista_id = f.motorista_id
      AND ct.deleted_at IS NULL
      AND ct.estado_operacional <> 'cancelado'
      AND ct.data_inicio::date <= f.data_movimento
      AND (ct.data_fim IS NULL OR ct.data_fim::date >= f.data_movimento)
  );

COMMENT ON VIEW public.v_dinheiro_sem_dono IS
  'Dinheiro que o sistema não sabe a quem imputar, ou que imputa mas nenhum ecrã mostra. Uma linha aqui é um erro por resolver — rever antes de fechar o período.';
