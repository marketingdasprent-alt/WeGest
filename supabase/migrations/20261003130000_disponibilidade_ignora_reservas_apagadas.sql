-- ============================================================
-- Reservas apagadas deixam de prender viaturas
-- ============================================================
-- viaturas_com_disponibilidade contava reservas com deleted_at preenchido:
-- uma reserva apagada em pendente/confirmada/em_curso deixava a viatura
-- ocupada no ecrã e na API até ao fim da reserva (14 casos a 02-10).
-- O EXCLUDE reservas_no_overbooking e reserva_tem_conflito já as ignoram.
--
-- Definição copiada de produção (pg_get_functiondef, 02-10). A única
-- alteração é "AND r.deleted_at IS NULL" no ramo das reservas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.viaturas_com_disponibilidade(p_data_inicio timestamp with time zone, p_data_fim timestamp with time zone, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(viatura_id uuid, disponivel boolean, conflitos jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH org AS (
    SELECT COALESCE(p_org_id, public.get_current_org_id()) AS org_id
  ),
  janela AS (
    SELECT tstzrange(p_data_inicio, p_data_fim, '[)') AS r
  ),
  conflitos AS (
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
      AND r.deleted_at IS NULL
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
$function$;

notify pgrst, 'reload schema';
