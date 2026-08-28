-- Recuperada de supabase_migrations.schema_migrations (versão 20260714150752).
-- Foi aplicada em produção sem ficheiro correspondente no repositório.
--
-- ATENÇÃO À ORDEM: a migração seguinte (20260714163041) DESFAZ esta, a pedido do
-- utilizador. Ambas ficam no repositório para o replay reproduzir o mesmo
-- histórico que produção — o estado final é o da segunda, não o desta.
--
-- ============================================================
-- Fix: recalcular_disponibilidade_viatura ignora versões substituídas
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
