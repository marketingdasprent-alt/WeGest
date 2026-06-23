-- ============================================================
-- Fase 2a — Cascata ao abrir contrato_renting
-- ============================================================
-- Quando um contrato_renting é criado, propaga estado:
--
--   1. reservas.estado            → 'em_curso' (se houver reserva_id)
--   2. calendario_eventos         → cria evento de entrega + recolha
--
-- Trigger AFTER INSERT garante atomicidade — se a cascata falhar,
-- toda a transacção faz rollback (incluindo o INSERT do contrato).
--
-- Decisões deliberadas:
--   • viaturas.status NÃO é tocado aqui. A determinação canónica vive
--     em recalcular_disponibilidade_viatura(viatura_id), chamada pelo
--     trigger trg_contratos_disponibilidade que corre logo a seguir.
--     Essa função define o estado correcto consoante o estado_operacional
--     do contrato: 'agendado' → viatura 'reservada'; 'em_curso' → 'em_uso'.
--   • motorista_viaturas NÃO é tocado aqui. A tabela é entre motoristas
--     internos e viaturas; o contrato_renting usa cliente_id (não
--     motorista_id). A ligação cliente↔motorista parceiro (TVDE) fica
--     para uma fase posterior.
--   • Não cria movimento de transferência. Decisão para a sub-fase 2c.
--   • Soft-delete (UPDATE deleted_at) não dispara este trigger — apenas
--     INSERT. Reverter cascata fica para sub-fase 2c (encerrar contrato).
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula text;
  v_cliente_nome text;
BEGIN
  -- Snapshot de dados úteis para o evento de calendário
  IF NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
  END IF;
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = NEW.cliente_id;
  END IF;

  -- 1. Reserva → em_curso (se contrato foi gerado a partir de reserva)
  IF NEW.reserva_id IS NOT NULL THEN
    UPDATE public.reservas
       SET estado = 'em_curso'
     WHERE id = NEW.reserva_id
       AND estado IN ('confirmada', 'pendente');
  END IF;

  -- (viaturas.status é tratado por trg_contratos_disponibilidade →
  --  recalcular_disponibilidade_viatura, que corre logo após este trigger.)

  -- 2. Evento de entrega (data_inicio do contrato)
  INSERT INTO public.calendario_eventos (
    tipo, titulo, descricao,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, criado_por
  )
  VALUES (
    'entrega',
    'Entrega — ' || COALESCE(v_matricula, '?') ||
      CASE WHEN v_cliente_nome IS NOT NULL THEN ' (' || v_cliente_nome || ')' ELSE '' END,
    'Gerado automaticamente pelo contrato #' || NEW.codigo,
    NEW.data_inicio, NEW.data_inicio, false,
    v_matricula, COALESCE(NEW.created_by, auth.uid())
  );

  -- 3. Evento de recolha (data_fim do contrato — se existir)
  IF NEW.data_fim IS NOT NULL THEN
    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por
    )
    VALUES (
      'recolha',
      'Recolha — ' || COALESCE(v_matricula, '?') ||
        CASE WHEN v_cliente_nome IS NOT NULL THEN ' (' || v_cliente_nome || ')' ELSE '' END,
      'Gerado automaticamente pelo contrato #' || NEW.codigo,
      NEW.data_fim, NEW.data_fim, false,
      v_matricula, COALESCE(NEW.created_by, auth.uid())
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_open() IS
  'Cascata ao criar contrato_renting: avança reserva, ocupa viatura, gera eventos no calendário.';

DROP TRIGGER IF EXISTS trg_contrato_renting_cascata_open ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_cascata_open
  AFTER INSERT ON public.contratos_renting
  FOR EACH ROW
  EXECUTE FUNCTION public.contrato_renting_cascata_open();
