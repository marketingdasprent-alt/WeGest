-- ============================================================
-- Histórico do contrato: marcos respeitam o ESTADO ATUAL
-- ============================================================
-- O histórico (RPC contrato_historico_resumo) mostrava marcos já REVERTIDOS.
-- O log `contrato_historico` é append-only e a RPC pegava, por tipo, na
-- entrada mais recente — mas uma reversão (ex.: "reverter abertura",
-- em_curso → agendado) só grava uma "alteração" genérica e NÃO supera a
-- entrada do marco. Resultado: "Contrato aberto por…" continuava a aparecer
-- mesmo depois de revertida a abertura.
--
-- Fix (só de leitura — NÃO apaga o log de auditoria): cada marco só é
-- devolvido se o ESTADO ATUAL do contrato o confirmar. Assim, reverter a ação
-- faz o marco desaparecer sozinho, porque o estado volta atrás:
--   contrato_aberto   → só se estado_operacional <> 'agendado'
--   contrato_fechado  → só se estado_operacional IN ('devolvido','cancelado')
--   contrato_faturado → só se estado_financeiro <> 'pendente' (anular fatura repõe 'pendente')
--   reserva_criada    → sempre (a reserva foi mesmo criada)
-- 'ultima_alteracao' mantém-se (é a última entrada de qualquer tipo).
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_historico_resumo(p_contrato_id uuid)
 RETURNS TABLE(evento_tipo text, ator_id uuid, ator_nome text, detalhe text, criado_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT h.evento_tipo, h.ator_id, h.detalhe, h.criado_em,
           row_number() OVER (
             PARTITION BY h.evento_tipo ORDER BY h.criado_em DESC
           ) AS rn_por_tipo
    FROM public.contrato_historico h
    WHERE h.contrato_id = p_contrato_id
      AND h.org_id = public.get_current_org_id()
  ),
  ctr AS (
    SELECT estado_operacional::text AS eo, estado_financeiro::text AS ef
    FROM public.contratos_renting
    WHERE id = p_contrato_id
      AND org_id = public.get_current_org_id()
  ),
  marcos AS (
    SELECT b.evento_tipo, b.ator_id, b.detalhe, b.criado_em
    FROM base b
    CROSS JOIN ctr
    WHERE b.rn_por_tipo = 1
      AND (
            b.evento_tipo = 'reserva_criada'
        OR (b.evento_tipo = 'contrato_aberto'   AND ctr.eo <> 'agendado')
        OR (b.evento_tipo = 'contrato_fechado'  AND ctr.eo IN ('devolvido','cancelado'))
        OR (b.evento_tipo = 'contrato_faturado' AND ctr.ef <> 'pendente')
      )
  ),
  ultima AS (
    SELECT 'ultima_alteracao'::text AS evento_tipo, ator_id, detalhe, criado_em
    FROM base
    ORDER BY criado_em DESC
    LIMIT 1
  ),
  todos AS (
    SELECT * FROM marcos
    UNION ALL
    SELECT * FROM ultima
  )
  SELECT t.evento_tipo, t.ator_id, COALESCE(p.nome, 'Sistema') AS ator_nome,
         t.detalhe, t.criado_em
  FROM todos t
  LEFT JOIN public.profiles p ON p.id = t.ator_id
  ORDER BY CASE t.evento_tipo
    WHEN 'reserva_criada'    THEN 1
    WHEN 'contrato_aberto'   THEN 2
    WHEN 'contrato_fechado'  THEN 3
    WHEN 'contrato_faturado' THEN 4
    WHEN 'ultima_alteracao'  THEN 5
    ELSE 9
  END;
$function$;
