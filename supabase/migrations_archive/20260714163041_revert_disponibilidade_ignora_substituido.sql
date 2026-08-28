-- Recuperada de supabase_migrations.schema_migrations (versão 20260714163041).
-- Foi aplicada em produção sem ficheiro correspondente no repositório.
--
-- Reverte a alteração anterior a recalcular_disponibilidade_viatura/trigger,
-- e repõe o status das 2 viaturas que o backfill tinha mudado
-- (BQ-14-AR, BH-84-HF: 'disponivel' -> 'reservada'), a pedido do utilizador
-- (o diagnóstico do bug de troca de viatura ficou por confirmar).

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
      AND c.estado_operacional = 'em_curso'
  ) THEN
    v_novo := 'em_uso';
  ELSIF EXISTS (
    SELECT 1 FROM public.contratos_renting c
    WHERE c.viatura_id = p_viatura_id
      AND c.deleted_at IS NULL
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
  'Não mexe se o status actual for manual/operacional (manutencao/inativo/vendida/em_recolha).';

DROP TRIGGER IF EXISTS trg_contratos_disponibilidade ON public.contratos_renting;
CREATE TRIGGER trg_contratos_disponibilidade
  AFTER INSERT OR DELETE OR UPDATE OF estado_operacional, viatura_id, deleted_at
  ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.trg_contratos_disponibilidade();

UPDATE public.viaturas SET status = 'reservada'
 WHERE matricula IN ('BQ-14-AR', 'BH-84-HF') AND status = 'disponivel';
