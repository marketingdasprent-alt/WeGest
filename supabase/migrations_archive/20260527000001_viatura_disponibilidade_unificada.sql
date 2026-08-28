-- ============================================================
-- Disponibilidade unificada de viaturas (estilo AnyRent)
-- ============================================================
-- Cruza num único ponto todas as fontes que ocupam uma viatura
-- num intervalo de datas: contratos, reservas, movimentos e
-- reparações. Permite à UI mostrar só viaturas realmente livres
-- num intervalo, e indicar a razão para as ocupadas.
--
-- Tudo aqui é READ-ONLY (RPCs + view). Não há triggers de
-- write-side neste passo — o anti-overbooking entre contratos
-- já é feito pelo EXCLUDE constraint existente em contratos_renting,
-- e a validação cross-table existente para reservas mantém-se.
-- Um eventual trigger para movimentos pode ser adicionado mais tarde
-- (ver bloco PHASE 2 no fim, comentado).
--
-- Esta migration é IDEMPOTENTE — pode ser corrida múltiplas vezes
-- sem efeitos colaterais.
-- ============================================================


-- ============================================================
-- 1) viatura_ocupacao_intervalos
-- ------------------------------------------------------------
-- Devolve a timeline de ocupação de UMA viatura entre duas datas
-- opcionais (omitir = "para sempre"). Junta as 4 fontes:
--   • contratos_renting (estados activos: agendado, em_curso)
--   • reservas          (estados activos: pendente, confirmada, em_curso)
--                       — excluindo reservas já materializadas em contrato
--   • movimentos        (estados activos: planeado, a_decorrer)
--   • viatura_reparacoes (com data_entrada preenchida e data_saida
--                          NULL ⇒ ainda em curso)
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
  'Timeline de ocupação de uma viatura cruzando contratos, reservas, movimentos e reparações activos. Janela opcional [p_from, p_to).';


-- ============================================================
-- 2) viatura_conflitos_no_intervalo
-- ------------------------------------------------------------
-- Conveniência para validação UX: devolve as ocupações que
-- conflituam com [p_data_inicio, p_data_fim), permitindo excluir
-- o próprio registo (caso edição). Lista vazia = livre.
-- ============================================================
CREATE OR REPLACE FUNCTION public.viatura_conflitos_no_intervalo(
  p_viatura_id           uuid,
  p_data_inicio          timestamptz,
  p_data_fim             timestamptz,
  p_excluir_contrato_id  uuid DEFAULT NULL,
  p_excluir_reserva_id   uuid DEFAULT NULL,
  p_excluir_movimento_id uuid DEFAULT NULL,
  p_excluir_reparacao_id uuid DEFAULT NULL
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
  SELECT *
    FROM public.viatura_ocupacao_intervalos(p_viatura_id, p_data_inicio, p_data_fim) o
   WHERE NOT (
       (o.fonte = 'contrato'  AND o.fonte_id = p_excluir_contrato_id)
    OR (o.fonte = 'reserva'   AND o.fonte_id = p_excluir_reserva_id)
    OR (o.fonte = 'movimento' AND o.fonte_id = p_excluir_movimento_id)
    OR (o.fonte = 'reparacao' AND o.fonte_id = p_excluir_reparacao_id)
   );
$$;

COMMENT ON FUNCTION public.viatura_conflitos_no_intervalo IS
  'Conflitos de ocupação de uma viatura num intervalo, com exclusão opcional do próprio registo (edição). Lista vazia = livre.';


-- ============================================================
-- 3) viaturas_com_disponibilidade
-- ------------------------------------------------------------
-- A função "porta-aviões": devolve TODAS as viaturas da org com
-- a indicação se estão livres no intervalo + array JSON das
-- ocupações que conflituam (para tooltips / razões na UI).
--
-- Filtra:
--   • viaturas da org actual (ou p_org_id se passado)
--   • exclui is_vendida = true
--
-- Cada conflito tem este formato:
--   {
--     "fonte":      "contrato" | "reserva" | "movimento" | "reparacao",
--     "fonte_id":   "uuid",
--     "codigo":     1234 ou null,
--     "data_inicio":"...",
--     "data_fim":   "..." ou null,
--     "estado":     "...",
--     "tipo":       "..." (só movimentos),
--     "descricao":  "..."
--   }
-- ============================================================
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
           AND c2.estado_operacional::text IN ('agendado', 'em_curso')
      )
      AND tstzrange(r.data_inicio, r.data_fim, '[)') && janela.r

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
    AND (v.is_vendida IS NULL OR v.is_vendida = false);
$$;

COMMENT ON FUNCTION public.viaturas_com_disponibilidade IS
  'Lista todas as viaturas (não vendidas) da org com flag disponivel e array JSON de conflitos para [p_data_inicio, p_data_fim). Uma chamada serve para popular qualquer seletor com "estilo AnyRent".';


-- ============================================================
-- 4) View vw_viatura_ocupacao
-- ------------------------------------------------------------
-- Cache leitor: timeline cruzada de TODAS as ocupações activas,
-- com viatura_id, org_id, fonte, datas e estado. Útil para
-- debug / relatórios / análise de overlaps sem ter de chamar
-- a função para cada viatura.
-- ============================================================
DROP VIEW IF EXISTS public.vw_viatura_ocupacao;
CREATE VIEW public.vw_viatura_ocupacao AS
  SELECT
    'contrato'::text             AS fonte,
    c.id                         AS fonte_id,
    c.org_id                     AS org_id,
    c.viatura_id                 AS viatura_id,
    c.codigo                     AS codigo,
    c.data_inicio                AS data_inicio,
    c.data_fim                   AS data_fim,
    c.estado_operacional::text   AS estado,
    NULL::text                   AS tipo
  FROM public.contratos_renting c
  WHERE c.deleted_at IS NULL
    AND c.viatura_id IS NOT NULL
    AND c.estado_operacional::text IN ('agendado', 'em_curso')

  UNION ALL

  SELECT
    'reserva'::text,
    r.id,
    r.org_id,
    r.viatura_id,
    r.codigo,
    r.data_inicio,
    r.data_fim,
    r.estado::text,
    NULL::text
  FROM public.reservas r
  WHERE r.viatura_id IS NOT NULL
    AND r.estado::text IN ('pendente', 'confirmada', 'em_curso')
    AND NOT EXISTS (
      SELECT 1 FROM public.contratos_renting c2
       WHERE c2.reserva_id = r.id
         AND c2.deleted_at IS NULL
         AND c2.estado_operacional::text IN ('agendado', 'em_curso')
    )

  UNION ALL

  SELECT
    'movimento'::text,
    m.id,
    m.org_id,
    m.viatura_id,
    m.codigo,
    m.data_partida,
    m.data_chegada,
    m.estado::text,
    m.tipo::text
  FROM public.movimentos m
  WHERE m.viatura_id IS NOT NULL
    AND m.estado::text IN ('planeado', 'a_decorrer')
    AND m.data_partida IS NOT NULL

  UNION ALL

  SELECT
    'reparacao'::text,
    rep.id,
    vw.org_id,
    rep.viatura_id,
    NULL::integer,
    rep.data_entrada::timestamptz,
    rep.data_saida::timestamptz,
    NULL::text,
    NULL::text
  FROM public.viatura_reparacoes rep
  JOIN public.viaturas vw ON vw.id = rep.viatura_id
  WHERE rep.viatura_id IS NOT NULL
    AND rep.data_entrada IS NOT NULL;

COMMENT ON VIEW public.vw_viatura_ocupacao IS
  'Timeline unificada de ocupações activas (contratos, reservas, movimentos, reparações). Para análise/admin — a UI usa as RPCs viatura_ocupacao_intervalos / viaturas_com_disponibilidade.';


-- ============================================================
-- 5) Permissões
-- ============================================================
GRANT EXECUTE ON FUNCTION public.viatura_ocupacao_intervalos(uuid, timestamptz, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.viatura_conflitos_no_intervalo(uuid, timestamptz, timestamptz, uuid, uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.viaturas_com_disponibilidade(timestamptz, timestamptz, uuid)
  TO authenticated;
GRANT SELECT ON public.vw_viatura_ocupacao TO authenticated;


-- ============================================================
-- PHASE 2 (write-side / anti-overbooking de movimentos)
-- ------------------------------------------------------------
-- Bloco propositadamente COMENTADO. Ativar manualmente quando a
-- equipa de contratos validar que não interfere com fluxos como
-- "criar movimento de transferência para preparar entrega de
-- contrato futuro". O trigger só bloqueia overlap real — não
-- toca em fluxos non-overlapping.
-- ------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.fn_movimentos_validar_ocupacao()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   v_conflito record;
-- BEGIN
--   IF NEW.viatura_id IS NULL
--      OR NEW.data_partida IS NULL
--      OR NEW.estado NOT IN ('planeado', 'a_decorrer') THEN
--     RETURN NEW;
--   END IF;
--
--   SELECT * INTO v_conflito
--     FROM public.viatura_conflitos_no_intervalo(
--       NEW.viatura_id,
--       NEW.data_partida,
--       COALESCE(NEW.data_chegada, 'infinity'::timestamptz),
--       NULL, NULL, NEW.id, NULL
--     )
--    LIMIT 1;
--
--   IF FOUND THEN
--     RAISE EXCEPTION 'Viatura ocupada no intervalo: % (% a %)',
--       v_conflito.descricao, v_conflito.data_inicio, COALESCE(v_conflito.data_fim::text, 'em curso');
--   END IF;
--
--   RETURN NEW;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS trg_movimentos_validar_ocupacao ON public.movimentos;
-- CREATE TRIGGER trg_movimentos_validar_ocupacao
--   BEFORE INSERT OR UPDATE OF viatura_id, data_partida, data_chegada, estado
--   ON public.movimentos
--   FOR EACH ROW EXECUTE FUNCTION public.fn_movimentos_validar_ocupacao();
