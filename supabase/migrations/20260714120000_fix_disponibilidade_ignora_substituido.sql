-- ============================================================
-- Fix: recalcular_disponibilidade_viatura ignora versões substituídas
-- ============================================================
-- Bug (mesma classe do já corrigido em useViaturasOcupadasPeriodo/
-- useViaturaVinculosAtivos no frontend): ao trocar a viatura dum contrato
-- (upgrade/downgrade/troca), a versão antiga só fica marcada com
-- `substituido_em` — quando essa troca não passa pelo fecho formal (ex.:
-- dados anteriores a 20260710000001_troca_fecho_formal.sql, ou qualquer
-- fluxo futuro que marque substituido_em sem fechar o `estado_operacional`),
-- o contrato antigo mantém-se em ('agendado','em_curso'). Sem o filtro
-- `substituido_em IS NULL`, recalcular_disponibilidade_viatura continuava a
-- contar essa versão substituída como ocupação real, prendendo
-- `viaturas.status` da viatura antiga em 'em_uso'/'reservada' para sempre —
-- confirmado em produção (BQ-14-AR preso em 'reservada' por causa do
-- contrato #108, substituído a 2026-07-08 mas nunca cancelado).
--
-- Fix adicional: o trigger só recalculava em UPDATE de
-- (estado_operacional, viatura_id, deleted_at) — uma troca que só altera
-- `substituido_em` (sem tocar estado_operacional) nunca disparava a
-- recalculação da viatura antiga. Acrescenta substituido_em à lista.
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalcular_disponibilidade_viatura(p_viatura_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_novo   text;
BEGIN
  IF p_viatura_id IS NULL THEN RETURN; END IF;

  SELECT status INTO v_status FROM public.viaturas WHERE id = p_viatura_id;
  IF v_status IS NULL THEN RETURN; END IF;

  -- Estados manuais/operacionais têm prioridade — não mexer.
  IF v_status IN ('manutencao', 'inativo', 'vendida', 'em_recolha') THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contratos_renting c
    WHERE c.viatura_id = p_viatura_id
      AND c.deleted_at IS NULL
      AND c.substituido_em IS NULL
      AND c.estado_operacional = 'em_curso'
  ) THEN
    v_novo := 'em_uso';
  ELSIF EXISTS (
    SELECT 1 FROM public.contratos_renting c
    WHERE c.viatura_id = p_viatura_id
      AND c.deleted_at IS NULL
      AND c.substituido_em IS NULL
      AND c.estado_operacional = 'agendado'
  ) OR EXISTS (
    SELECT 1 FROM public.reservas r
    WHERE r.viatura_id = p_viatura_id
      AND r.deleted_at IS NULL
      AND r.estado = 'confirmada'
  ) THEN
    v_novo := 'reservada';
  ELSE
    v_novo := 'disponivel';
  END IF;

  IF v_novo IS DISTINCT FROM v_status THEN
    UPDATE public.viaturas SET status = v_novo WHERE id = p_viatura_id;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.recalcular_disponibilidade_viatura(uuid) IS
  'Recalcula viaturas.status a partir dos contratos/reservas activos dessa viatura. '
  'Não mexe se o status actual for manual/operacional (manutencao/inativo/vendida/em_recolha). '
  'Fix 2026-07-14: ignora versões de contrato substituídas (substituido_em IS NOT NULL).';

DROP TRIGGER IF EXISTS trg_contratos_disponibilidade ON public.contratos_renting;
CREATE TRIGGER trg_contratos_disponibilidade
  AFTER INSERT OR DELETE OR UPDATE OF estado_operacional, viatura_id, deleted_at, substituido_em
  ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.trg_contratos_disponibilidade();

-- ────────────────────────────────────────────────────────────
-- Backfill: só recalcula as viaturas realmente afectadas por este bug
-- (têm uma versão substituída que ainda contava como 'agendado'/'em_curso'),
-- para não mexer na classificação doutras viaturas por outra via.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT DISTINCT c.viatura_id
      FROM public.contratos_renting c
     WHERE c.substituido_em IS NOT NULL
       AND c.deleted_at IS NULL
       AND c.estado_operacional IN ('agendado', 'em_curso')
       AND c.viatura_id IS NOT NULL
  LOOP
    PERFORM public.recalcular_disponibilidade_viatura(v_id);
  END LOOP;
END;
$$;
