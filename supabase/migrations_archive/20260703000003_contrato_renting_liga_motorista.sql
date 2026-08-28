-- ============================================================
-- Ligação motorista ↔ contrato_renting ↔ viatura
-- ============================================================
-- Bug reportado: ao abrir um contrato de aluguer (contratos_renting)
-- para um cliente que é motorista da frota (tipo_cliente='condutor',
-- ligado via motoristas_ativos.cliente_id), a viatura escolhida nunca
-- ficava associada ao motorista em motorista_viaturas, e ao fechar o
-- contrato o motorista não ficava inativo nem a viatura desassociada.
--
-- A migration 20260520300001 já documentava esta lacuna como decisão
-- deliberada ("fica para uma fase posterior") — esta é essa fase.
--
-- Só actua quando NEW.cliente_id corresponde a um motorista (via
-- motoristas_ativos.cliente_id). Clientes de aluguer normais (não
-- motoristas) continuam sem tocar motorista_viaturas / motoristas_ativos.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Abertura — INSERT ou transição para em_curso: associar viatura
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.contrato_renting_liga_motorista_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motorista_id uuid;
BEGIN
  IF NEW.viatura_id IS NULL OR NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_motorista_id
  FROM public.motoristas_ativos
  WHERE cliente_id = NEW.cliente_id
  LIMIT 1;

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
  'Ao abrir/actualizar contrato_renting com viatura para um cliente que é motorista, associa a viatura em motorista_viaturas e garante motorista activo.';

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

-- ────────────────────────────────────────────────────────────
-- 2. Fecho — estado_operacional passa a devolvido/cancelado (ou soft-delete):
--    desassociar viatura e, se sem outro contrato activo, inactivar motorista
-- ────────────────────────────────────────────────────────────
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
  IF NEW.viatura_id IS NULL OR NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_motorista_id
  FROM public.motoristas_ativos
  WHERE cliente_id = NEW.cliente_id
  LIMIT 1;

  IF v_motorista_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.motorista_viaturas
     SET status = 'encerrado', data_fim = COALESCE(data_fim, CURRENT_DATE)
   WHERE motorista_id = v_motorista_id
     AND viatura_id = NEW.viatura_id
     AND status = 'ativo';

  -- Só inactiva se não houver outro contrato_renting activo (e não substituído)
  -- para este motorista. substituido_em IS NULL é essencial: uma versão antiga
  -- trocada mantém estado_operacional='em_curso' para sempre (nunca muda),
  -- por isso teria sempre de ser ignorada aqui.
  SELECT EXISTS (
    SELECT 1
    FROM public.contratos_renting cr
    JOIN public.motoristas_ativos ma ON ma.cliente_id = cr.cliente_id
    WHERE ma.id = v_motorista_id
      AND cr.id <> NEW.id
      AND cr.deleted_at IS NULL
      AND cr.substituido_em IS NULL
      AND cr.estado_operacional IN ('agendado', 'em_curso')
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
  'Ao fechar contrato_renting (devolvido/cancelado/eliminado) para um motorista, desassocia a viatura em motorista_viaturas e inactiva o motorista se não tiver outro contrato activo.';

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
