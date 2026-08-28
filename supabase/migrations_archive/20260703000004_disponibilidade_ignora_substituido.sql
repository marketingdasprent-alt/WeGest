-- ============================================================
-- Disponibilidade de viaturas ignorava versões substituídas
-- ============================================================
-- Ao trocar/fazer upgrade/downgrade de viatura num contrato_renting,
-- cria-se uma nova VERSÃO (linha nova, contrato_anterior_id + versao+1).
-- A versão antiga fica com substituido_em preenchido, mas o seu
-- estado_operacional NUNCA muda (continua 'agendado'/'em_curso' para
-- sempre). Todas as funções de disponibilidade filtravam só por
-- deleted_at + estado_operacional, contando as DUAS linhas (antiga
-- substituída + nova activa) como ocupação — a viatura antiga ficava
-- "Em Contrato" indefinidamente mesmo já devolvida fisicamente.
--
-- Fix: acrescentar `AND c.substituido_em IS NULL` a toda a leitura de
-- contratos_renting usada para calcular ocupação/disponibilidade.
-- Idempotente (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.viatura_ocupacao_intervalos(
  p_viatura_id uuid,
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL
)
RETURNS TABLE (
  fonte       text,
  fonte_id    uuid,
  codigo      integer,
  data_inicio timestamptz,
  data_fim    timestamptz,
  estado      text,
  tipo        text,
  descricao   text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH janela AS (
    SELECT tstzrange(
      COALESCE(p_from, '-infinity'::timestamptz),
      COALESCE(p_to,   'infinity'::timestamptz),
      '[)'
    ) AS r
  )
  SELECT
    'contrato'::text                         AS fonte,
    c.id                                     AS fonte_id,
    c.codigo                                 AS codigo,
    c.data_inicio                            AS data_inicio,
    c.data_fim                               AS data_fim,
    c.estado_operacional::text               AS estado,
    NULL::text                               AS tipo,
    'Contrato #' || c.codigo::text           AS descricao
  FROM public.contratos_renting c
  CROSS JOIN janela
  WHERE c.viatura_id = p_viatura_id
    AND c.deleted_at IS NULL
    AND c.substituido_em IS NULL
    AND c.estado_operacional::text IN ('agendado', 'em_curso')
    AND tstzrange(c.data_inicio, c.data_fim, '[)') && janela.r

  UNION ALL

  SELECT
    'reserva'::text,
    r.id,
    r.codigo,
    r.data_inicio,
    r.data_fim,
    r.estado::text,
    NULL::text,
    'Reserva #' || r.codigo::text
  FROM public.reservas r
  CROSS JOIN janela
  WHERE r.viatura_id = p_viatura_id
    AND r.estado::text IN ('pendente', 'confirmada', 'em_curso')
    AND NOT EXISTS (
      SELECT 1 FROM public.contratos_renting c2
       WHERE c2.reserva_id = r.id
         AND c2.deleted_at IS NULL
         AND c2.substituido_em IS NULL
         AND c2.estado_operacional::text IN ('agendado', 'em_curso')
    )
    AND tstzrange(r.data_inicio, r.data_fim, '[)') && janela.r

  UNION ALL

  SELECT
    'movimento'::text,
    m.id,
    m.codigo,
    m.data_partida,
    m.data_chegada,
    m.estado::text,
    m.tipo::text,
    'Movimento #' || m.codigo::text || ' (' || m.tipo::text || ')'
  FROM public.movimentos m
  CROSS JOIN janela
  WHERE m.viatura_id = p_viatura_id
    AND m.estado::text IN ('planeado', 'a_decorrer')
    AND m.data_partida IS NOT NULL
    AND tstzrange(
          m.data_partida,
          COALESCE(m.data_chegada, 'infinity'::timestamptz),
          '[)'
        ) && janela.r

  UNION ALL

  SELECT
    'reparacao'::text,
    rep.id,
    NULL::integer,
    rep.data_entrada::timestamptz,
    rep.data_saida::timestamptz,
    NULL::text,
    NULL::text,
    'Reparação' || COALESCE(' — ' || rep.oficina, '')
  FROM public.viatura_reparacoes rep
  CROSS JOIN janela
  WHERE rep.viatura_id = p_viatura_id
    AND rep.data_entrada IS NOT NULL
    AND tstzrange(
          rep.data_entrada::timestamptz,
          COALESCE(rep.data_saida::timestamptz, 'infinity'::timestamptz),
          '[)'
        ) && janela.r

  ORDER BY data_inicio NULLS FIRST;
$$;

COMMENT ON FUNCTION public.viatura_ocupacao_intervalos(uuid, timestamptz, timestamptz) IS
  'Timeline de ocupação de uma viatura cruzando contratos, reservas, movimentos e reparações activos. Janela opcional [p_from, p_to). Ignora versões de contrato substituídas (substituido_em).';

CREATE OR REPLACE FUNCTION public.viaturas_com_disponibilidade(
  p_data_inicio timestamptz,
  p_data_fim    timestamptz,
  p_org_id      uuid DEFAULT NULL
)
RETURNS TABLE (
  viatura_id uuid,
  disponivel boolean,
  conflitos  jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH org AS (
    SELECT COALESCE(p_org_id, public.get_current_org_id()) AS org_id
  ),
  janela AS (
    SELECT tstzrange(p_data_inicio, p_data_fim, '[)') AS r
  ),
  conflitos AS (
    -- Contratos activos
    SELECT
      c.viatura_id,
      jsonb_build_object(
        'fonte',       'contrato',
        'fonte_id',    c.id,
        'codigo',      c.codigo,
        'data_inicio', c.data_inicio,
        'data_fim',    c.data_fim,
        'estado',      c.estado_operacional::text,
        'descricao',   'Contrato #' || c.codigo::text
      ) AS conflito
    FROM public.contratos_renting c
    CROSS JOIN org
    CROSS JOIN janela
    WHERE c.org_id = org.org_id
      AND c.viatura_id IS NOT NULL
      AND c.deleted_at IS NULL
      AND c.substituido_em IS NULL
      AND c.estado_operacional::text IN ('agendado', 'em_curso')
      AND tstzrange(c.data_inicio, c.data_fim, '[)') && janela.r

    UNION ALL

    -- Reservas activas (sem contrato derivado activo)
    SELECT
      r.viatura_id,
      jsonb_build_object(
        'fonte',       'reserva',
        'fonte_id',    r.id,
        'codigo',      r.codigo,
        'data_inicio', r.data_inicio,
        'data_fim',    r.data_fim,
        'estado',      r.estado::text,
        'descricao',   'Reserva #' || r.codigo::text
      )
    FROM public.reservas r
    CROSS JOIN org
    CROSS JOIN janela
    WHERE r.org_id = org.org_id
      AND r.viatura_id IS NOT NULL
      AND r.estado::text IN ('pendente', 'confirmada', 'em_curso')
      AND NOT EXISTS (
        SELECT 1 FROM public.contratos_renting c2
         WHERE c2.reserva_id = r.id
           AND c2.deleted_at IS NULL
           AND c2.substituido_em IS NULL
           AND c2.estado_operacional::text IN ('agendado', 'em_curso')
      )
      AND tstzrange(r.data_inicio, COALESCE(r.data_fim, 'infinity'::timestamptz), '[)') && janela.r

    UNION ALL

    -- Movimentos activos
    SELECT
      m.viatura_id,
      jsonb_build_object(
        'fonte',       'movimento',
        'fonte_id',    m.id,
        'codigo',      m.codigo,
        'data_inicio', m.data_partida,
        'data_fim',    m.data_chegada,
        'estado',      m.estado::text,
        'tipo',        m.tipo::text,
        'descricao',   'Movimento #' || m.codigo::text || ' (' || m.tipo::text || ')'
      )
    FROM public.movimentos m
    CROSS JOIN org
    CROSS JOIN janela
    WHERE m.org_id = org.org_id
      AND m.viatura_id IS NOT NULL
      AND m.estado::text IN ('planeado', 'a_decorrer')
      AND m.data_partida IS NOT NULL
      AND tstzrange(
            m.data_partida,
            COALESCE(m.data_chegada, 'infinity'::timestamptz),
            '[)'
          ) && janela.r

    UNION ALL

    -- Reparações em curso
    SELECT
      rep.viatura_id,
      jsonb_build_object(
        'fonte',       'reparacao',
        'fonte_id',    rep.id,
        'data_inicio', rep.data_entrada,
        'data_fim',    rep.data_saida,
        'descricao',   'Reparação' || COALESCE(' — ' || rep.oficina, '')
      )
    FROM public.viatura_reparacoes rep
    JOIN public.viaturas vw ON vw.id = rep.viatura_id
    CROSS JOIN org
    CROSS JOIN janela
    WHERE vw.org_id = org.org_id
      AND rep.viatura_id IS NOT NULL
      AND rep.data_entrada IS NOT NULL
      AND tstzrange(
            rep.data_entrada::timestamptz,
            COALESCE(rep.data_saida::timestamptz, 'infinity'::timestamptz),
            '[)'
          ) && janela.r
  ),
  agg AS (
    SELECT
      conflitos.viatura_id,
      jsonb_agg(conflitos.conflito ORDER BY (conflitos.conflito->>'data_inicio')) AS conflitos
    FROM conflitos
    GROUP BY conflitos.viatura_id
  )
  SELECT
    v.id                                                AS viatura_id,
    COALESCE(agg.conflitos, '[]'::jsonb) = '[]'::jsonb  AS disponivel,
    COALESCE(agg.conflitos, '[]'::jsonb)                AS conflitos
  FROM public.viaturas v
  CROSS JOIN org
  LEFT JOIN agg ON agg.viatura_id = v.id
  WHERE v.org_id = org.org_id
    AND (v.is_vendida IS NULL OR v.is_vendida = false)
    AND (v.is_slot IS NULL OR v.is_slot = false);
$$;

COMMENT ON FUNCTION public.viaturas_com_disponibilidade IS
  'Disponibilidade unificada por viatura num intervalo. Exclui viaturas vendidas e viaturas slot (carros externos do motorista). Ignora versões de contrato substituídas (substituido_em).';
