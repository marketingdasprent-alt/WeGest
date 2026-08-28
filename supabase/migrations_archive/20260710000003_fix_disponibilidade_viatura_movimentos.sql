-- ============================================================
-- Fix: conclusão de movimento (reparação/manutenção/etc.) força
-- viaturas.status = 'disponivel' às cegas, mesmo que a viatura tenha
-- entretanto um contrato ou reserva activo.
-- ============================================================
-- Bug: uma viatura pode ter um movimento (reparação/manutenção/impro/
-- inspecao) a decorrer AO MESMO TEMPO que um contrato/reserva — não há
-- nenhuma exclusão entre `movimentos` e `contratos_renting`/`reservas` ao
-- nível da BD (só contratos-vs-contratos e reservas-vs-reservas têm
-- EXCLUDE constraint via a coluna `periodo`). Quando esse movimento
-- concluía ou era cancelado, `movimento_sync_viatura()` escrevia
-- `status = 'disponivel'` incondicionalmente — mascarando uma viatura
-- que estivesse `em_curso` num contrato como "disponível" na frota.
--
-- Fix: em vez de assumir 'disponivel', delega em
-- `recalcular_disponibilidade_viatura()` — a mesma função que
-- `trg_contratos_disponibilidade`/`trg_reservas_disponibilidade` usam —
-- para repor o estado certo (em_uso/reservada/disponivel) a partir dos
-- contratos/reservas activos dessa viatura.
--
-- Esta migration também versiona, pela primeira vez nesta branch,
-- `recalcular_disponibilidade_viatura` e as triggers
-- trg_contratos_disponibilidade/trg_reservas_disponibilidade — hoje só
-- existem aplicadas directamente em produção (nunca foram integradas a
-- partir da branch onde nasceram). Sem isto, o fix a `movimento_sync_
-- viatura` ficaria a chamar uma função sem ficheiro de origem na branch
-- principal.
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

CREATE OR REPLACE FUNCTION public.trg_contratos_disponibilidade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalcular_disponibilidade_viatura(OLD.viatura_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalcular_disponibilidade_viatura(NEW.viatura_id);
  IF TG_OP = 'UPDATE' AND OLD.viatura_id IS DISTINCT FROM NEW.viatura_id THEN
    PERFORM public.recalcular_disponibilidade_viatura(OLD.viatura_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contratos_disponibilidade ON public.contratos_renting;
CREATE TRIGGER trg_contratos_disponibilidade
  AFTER INSERT OR DELETE OR UPDATE OF estado_operacional, viatura_id, deleted_at
  ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.trg_contratos_disponibilidade();

CREATE OR REPLACE FUNCTION public.trg_reservas_disponibilidade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalcular_disponibilidade_viatura(OLD.viatura_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalcular_disponibilidade_viatura(NEW.viatura_id);
  IF TG_OP = 'UPDATE' AND OLD.viatura_id IS DISTINCT FROM NEW.viatura_id THEN
    PERFORM public.recalcular_disponibilidade_viatura(OLD.viatura_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reservas_disponibilidade ON public.reservas;
CREATE TRIGGER trg_reservas_disponibilidade
  AFTER INSERT OR DELETE OR UPDATE OF estado, viatura_id, deleted_at
  ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.trg_reservas_disponibilidade();

-- ────────────────────────────────────────────────────────────
-- Fix propriamente dito: movimento_sync_viatura já não assume
-- 'disponivel' — delega em recalcular_disponibilidade_viatura.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.movimento_sync_viatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Sem viatura associada não há nada a sincronizar.
  IF NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Em UPDATE só age quando o estado muda de facto.
  IF TG_OP = 'UPDATE' AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF NEW.estado = 'a_decorrer' THEN
    IF NEW.tipo = 'impro' THEN
      UPDATE public.viaturas SET status = 'inativo' WHERE id = NEW.viatura_id;
    ELSIF NEW.tipo IN ('reparacao','manutencao','inspecao') THEN
      UPDATE public.viaturas SET status = 'manutencao' WHERE id = NEW.viatura_id;
    END IF;
    -- transferência: a viatura mantém o estado durante o trânsito.

  ELSIF NEW.estado = 'concluido' THEN
    IF NEW.tipo = 'transferencia' THEN
      UPDATE public.viaturas
         SET estacao_id = COALESCE(NEW.estacao_destino_id, estacao_id),
             km_atual   = CASE
               WHEN NEW.km_final IS NOT NULL AND NEW.km_final >= COALESCE(km_atual, 0)
               THEN NEW.km_final ELSE km_atual END
       WHERE id = NEW.viatura_id;
    ELSE
      -- Sai do 'manutencao'/'inativo' que este movimento impôs, mas não
      -- assume 'disponivel' às cegas: se a viatura tiver entretanto um
      -- contrato/reserva activo (ex.: reparação concluída depois de o
      -- contrato ter arrancado), recalcular_disponibilidade_viatura repõe
      -- o estado certo (em_uso/reservada) em vez de mascarar a ocupação real.
      UPDATE public.viaturas
         SET status   = 'disponivel',
             km_atual = CASE
               WHEN NEW.km_final IS NOT NULL AND NEW.km_final >= COALESCE(km_atual, 0)
               THEN NEW.km_final ELSE km_atual END
       WHERE id = NEW.viatura_id;
      PERFORM public.recalcular_disponibilidade_viatura(NEW.viatura_id);
    END IF;

  ELSIF NEW.estado = 'cancelado' THEN
    IF NEW.tipo IN ('reparacao','manutencao','impro','inspecao') THEN
      UPDATE public.viaturas SET status = 'disponivel' WHERE id = NEW.viatura_id;
      PERFORM public.recalcular_disponibilidade_viatura(NEW.viatura_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.movimento_sync_viatura() IS
  'Sincroniza viaturas.status a partir do movimento. Ao sair de manutencao/inativo, '
  'delega em recalcular_disponibilidade_viatura em vez de assumir disponivel às cegas — '
  'fix 2026-07-10: evitava mascarar uma viatura em_curso como disponível.';
