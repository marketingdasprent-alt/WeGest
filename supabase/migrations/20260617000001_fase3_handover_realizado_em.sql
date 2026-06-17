-- Fase 3 (migração handover events): reconciliar realizado_em para eventos contract-driven.
--
-- Objetivo: marcar como "realizados" os eventos de entrega/recolha que já foram
-- concluídos no fluxo legacy (checkout_pendente=false / checkin_pendente=false).
--
-- Isto transforma os eventos no modelo de verdade único, permitindo que as listas
-- de pendentes (CheckOutPendentesDrawer, RecolhasPendentesDrawer) leiam de
-- calendario_eventos.realizado_em IS NULL em vez de contratos.checkout_pendente/checkin_pendente.
--
-- Estratégia: usar os flags do contrato como fonte de verdade (são criados/atualizados
-- pela aplicação ao confirmar check-out/check-in). Apenas atualiza eventos que
-- pertencem a contratos já reconciliados (origem_tipo='contrato').
--
-- Backfill: 37 eventos contract-driven vão ganhar realizado_em = data_inicio:
--  - 35 entrega com checkout_pendente = false
--  - 2 recolha/devolucao com checkin_pendente = false

UPDATE public.calendario_eventos ce
SET realizado_em = COALESCE(ce.realizado_em, ce.data_inicio)
WHERE ce.origem_tipo = 'contrato'
  AND ce.realizado_em IS NULL
  AND ce.data_inicio IS NOT NULL
  AND (
    -- Entrega: reconciliar onde o check-out já foi feito no contrato
    (ce.tipo = 'entrega' AND EXISTS (
      SELECT 1 FROM public.contratos c
      WHERE c.id = ce.origem_id
        AND c.checkout_pendente = false
    ))
    OR
    -- Recolha/Devolucao: reconciliar onde o check-in já foi feito
    (ce.tipo IN ('recolha', 'devolucao') AND EXISTS (
      SELECT 1 FROM public.contratos c
      WHERE c.id = ce.origem_id
        AND c.checkin_pendente = false
    ))
  );

-- Nota para o próximo passo (Fase 4): as queries dos drawers foram ajustadas
-- em CheckOutPendentesDrawer.tsx e RecolhasPendentesDrawer.tsx para ler de
-- calendario_eventos em vez de contratos flags. Este backfill garante que
-- a transição não muda o comportamento observado.
