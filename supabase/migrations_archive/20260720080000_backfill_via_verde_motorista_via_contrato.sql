-- Backfill: resolve motorista_id em via_verde_transacoes cujas portagens
-- ficaram órfãs porque o import só olhava para motorista_viaturas, tabela
-- que fica facilmente dessincronizada dos contratos de renting (confirmado:
-- 35% da frota com contrato ativo não tinha linha ativa em
-- motorista_viaturas). contratos_renting/contrato_condutores é a fonte
-- prioritária (mesma prioridade de resolverCondutor.ts no frontend) — o
-- import (via-verde-import) já foi corrigido para usar esta ordem daqui
-- para a frente; esta migração corrige retroativamente o que já foi
-- importado.
UPDATE public.via_verde_transacoes t
SET motorista_id = (
  SELECT cc.motorista_id
  FROM public.contratos_renting cr
  JOIN public.contrato_condutores cc ON cc.contrato_id = cr.id
  WHERE cr.viatura_id = t.viatura_id
    AND cr.deleted_at IS NULL
    AND cr.periodo @> t.transaction_date
    AND cc.motorista_id IS NOT NULL
    AND cc.vigencia @> t.transaction_date
  ORDER BY cc.is_principal DESC, cc.created_at DESC
  LIMIT 1
)
WHERE t.motorista_id IS NULL
  AND t.viatura_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.contratos_renting cr
    JOIN public.contrato_condutores cc ON cc.contrato_id = cr.id
    WHERE cr.viatura_id = t.viatura_id
      AND cr.deleted_at IS NULL
      AND cr.periodo @> t.transaction_date
      AND cc.motorista_id IS NOT NULL
      AND cc.vigencia @> t.transaction_date
  );
