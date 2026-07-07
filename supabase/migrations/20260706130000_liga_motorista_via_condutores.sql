-- ============================================================
-- Liga motorista via contrato_condutores.motorista_id (fallback)
-- ============================================================
-- Bug real (auditoria 2026-07-06): contrato_renting_liga_motorista_open/close
-- só reconheciam motorista via motoristas_ativos.cliente_id = contrato.cliente_id.
-- Quando o titular do contrato é uma empresa-frota e o motorista real está
-- em contrato_condutores.motorista_id (caminho que existe desde
-- 20260520800001_condutores_bifurcacao_motorista.sql), os triggers nunca
-- o encontravam — saíam sem fazer nada. Medido: 12 contratos activos neste
-- padrão, 4 já com motorista_viaturas dessincronizado.
--
-- Fix: quando a busca directa por cliente_id não encontra motorista,
-- tenta um segundo caminho via contrato_condutores.motorista_id do
-- próprio contrato (NEW.id).
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_liga_motorista_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motorista_id uuid;
BEGIN
  IF NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT id INTO v_motorista_id
    FROM public.motoristas_ativos
    WHERE cliente_id = NEW.cliente_id
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    SELECT motorista_id INTO v_motorista_id
    FROM public.contrato_condutores
    WHERE contrato_id = NEW.id AND motorista_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Encerra associação activa anterior a outra viatura (troca/upgrade)
  UPDATE public.motorista_viaturas
     SET status = 'encerrado', data_fim = COALESCE(data_fim, NEW.data_inicio::date)
   WHERE motorista_id = v_motorista_id
     AND status = 'ativo'
     AND viatura_id IS DISTINCT FROM NEW.viatura_id;

  -- Cria associação se ainda não existir activa para esta viatura
  IF NOT EXISTS (
    SELECT 1 FROM public.motorista_viaturas
     WHERE motorista_id = v_motorista_id
       AND viatura_id = NEW.viatura_id
       AND status = 'ativo'
  ) THEN
    INSERT INTO public.motorista_viaturas (
      motorista_id, viatura_id, data_inicio, status, org_id, observacoes
    )
    VALUES (
      v_motorista_id, NEW.viatura_id, NEW.data_inicio::date, 'ativo', NEW.org_id,
      'Gerado automaticamente pelo contrato de aluguer #' || NEW.codigo
    );
  END IF;

  -- Garante motorista activo enquanto tiver contrato em curso
  UPDATE public.motoristas_ativos
     SET status_ativo = true
   WHERE id = v_motorista_id
     AND status_ativo = false;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_liga_motorista_open() IS
  'Ao abrir/actualizar contrato_renting com viatura, associa a viatura em motorista_viaturas e '
  'garante motorista activo. Resolve o motorista por cliente_id directo OU, em fallback, via '
  'contrato_condutores.motorista_id (contratos com titular empresa-frota e condutor TVDE real).';

DROP TRIGGER IF EXISTS trg_contrato_renting_liga_motorista_open ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_liga_motorista_open
  AFTER INSERT OR UPDATE OF viatura_id, cliente_id ON public.contratos_renting
  FOR EACH ROW
  WHEN (
    NEW.deleted_at IS NULL
    AND NEW.substituido_em IS NULL
    AND NEW.estado_operacional IN ('agendado', 'em_curso')
  )
  EXECUTE FUNCTION public.contrato_renting_liga_motorista_open();

CREATE OR REPLACE FUNCTION public.contrato_renting_liga_motorista_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motorista_id uuid;
  v_tem_outro_contrato boolean;
BEGIN
  IF NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT id INTO v_motorista_id
    FROM public.motoristas_ativos
    WHERE cliente_id = NEW.cliente_id
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    SELECT motorista_id INTO v_motorista_id
    FROM public.contrato_condutores
    WHERE contrato_id = NEW.id AND motorista_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.motorista_viaturas
     SET status = 'encerrado', data_fim = COALESCE(data_fim, CURRENT_DATE)
   WHERE motorista_id = v_motorista_id
     AND viatura_id = NEW.viatura_id
     AND status = 'ativo';

  -- Só inactiva se não houver outro contrato_renting activo (e não substituído)
  -- para este motorista, considerando os dois caminhos (cliente_id directo OU
  -- contrato_condutores.motorista_id).
  SELECT EXISTS (
    SELECT 1
    FROM public.contratos_renting cr
    WHERE cr.id <> NEW.id
      AND cr.deleted_at IS NULL
      AND cr.substituido_em IS NULL
      AND cr.estado_operacional IN ('agendado', 'em_curso')
      AND (
        EXISTS (
          SELECT 1 FROM public.motoristas_ativos ma
          WHERE ma.id = v_motorista_id AND ma.cliente_id = cr.cliente_id
        )
        OR EXISTS (
          SELECT 1 FROM public.contrato_condutores cc
          WHERE cc.contrato_id = cr.id AND cc.motorista_id = v_motorista_id
        )
      )
  ) INTO v_tem_outro_contrato;

  IF NOT v_tem_outro_contrato THEN
    UPDATE public.motoristas_ativos
       SET status_ativo = false
     WHERE id = v_motorista_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_liga_motorista_close() IS
  'Ao fechar contrato_renting (devolvido/cancelado/eliminado/substituído), desassocia a viatura '
  'em motorista_viaturas e inactiva o motorista se não tiver outro contrato activo. Resolve o '
  'motorista por cliente_id directo OU via contrato_condutores.motorista_id, e a verificação de '
  '"outro contrato activo" considera ambos os caminhos.';

DROP TRIGGER IF EXISTS trg_contrato_renting_liga_motorista_close ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_liga_motorista_close
  AFTER UPDATE OF estado_operacional, deleted_at, substituido_em ON public.contratos_renting
  FOR EACH ROW
  WHEN (
    (NEW.estado_operacional NOT IN ('agendado', 'em_curso') AND OLD.estado_operacional IN ('agendado', 'em_curso'))
    OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
    OR (NEW.substituido_em IS NOT NULL AND OLD.substituido_em IS NULL)
  )
  EXECUTE FUNCTION public.contrato_renting_liga_motorista_close();

-- ============================================================
-- Backfill: sincroniza motorista_viaturas para contratos já activos
-- que usam contrato_condutores.motorista_id e ainda não têm associação.
-- ============================================================
DO $$
DECLARE
  r RECORD;
  v_motorista_id uuid;
BEGIN
  FOR r IN
    SELECT cr.id, cr.viatura_id, cr.data_inicio, cr.org_id, cr.codigo
    FROM public.contratos_renting cr
    WHERE cr.deleted_at IS NULL
      AND cr.substituido_em IS NULL
      AND cr.estado_operacional IN ('agendado', 'em_curso')
      AND cr.viatura_id IS NOT NULL
  LOOP
    v_motorista_id := NULL;

    SELECT ma.id INTO v_motorista_id
    FROM public.motoristas_ativos ma
    JOIN public.contratos_renting cr2 ON cr2.id = r.id
    WHERE ma.cliente_id = cr2.cliente_id
    LIMIT 1;

    IF v_motorista_id IS NULL THEN
      SELECT motorista_id INTO v_motorista_id
      FROM public.contrato_condutores
      WHERE contrato_id = r.id AND motorista_id IS NOT NULL
      LIMIT 1;
    END IF;

    CONTINUE WHEN v_motorista_id IS NULL;

    UPDATE public.motorista_viaturas
       SET status = 'encerrado', data_fim = COALESCE(data_fim, r.data_inicio::date)
     WHERE motorista_id = v_motorista_id
       AND status = 'ativo'
       AND viatura_id IS DISTINCT FROM r.viatura_id;

    IF NOT EXISTS (
      SELECT 1 FROM public.motorista_viaturas
       WHERE motorista_id = v_motorista_id
         AND viatura_id = r.viatura_id
         AND status = 'ativo'
    ) THEN
      INSERT INTO public.motorista_viaturas (
        motorista_id, viatura_id, data_inicio, status, org_id, observacoes
      )
      VALUES (
        v_motorista_id, r.viatura_id, r.data_inicio::date, 'ativo', r.org_id,
        'Backfill 2026-07-06 — contrato de aluguer #' || r.codigo
      );
    END IF;

    UPDATE public.motoristas_ativos
       SET status_ativo = true
     WHERE id = v_motorista_id
       AND status_ativo = false;
  END LOOP;
END;
$$;
