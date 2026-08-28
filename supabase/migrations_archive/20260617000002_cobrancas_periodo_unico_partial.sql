-- Substituir o unique constraint de período por partial index que exclui anuladas.
-- O constraint original bloqueava re-faturação após anulação (a cobrança anulada
-- continuava a ocupar o slot de (contrato_id, destinatario_id, periodo_de, periodo_ate)).
ALTER TABLE public.contrato_cobrancas
  DROP CONSTRAINT IF EXISTS contrato_cobrancas_periodo_unico;

CREATE UNIQUE INDEX IF NOT EXISTS contrato_cobrancas_periodo_unico
  ON public.contrato_cobrancas (contrato_id, destinatario_id, periodo_de, periodo_ate)
  WHERE estado <> 'anulada';
