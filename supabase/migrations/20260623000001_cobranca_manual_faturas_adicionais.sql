-- ============================================================
-- Faturas adicionais ("Nova Fatura") — cobranças manuais
-- ============================================================
-- Permite emitir MAIS que uma fatura por contrato/reserva, com linhas
-- livres (artigos digitados à mão). Estas cobranças são marcadas como
-- `manual = true` e ficam FORA do índice único de período — caso contrário
-- uma segunda fatura no mesmo período/destinatário colidiria com a primeira
-- (contrato_cobrancas_periodo_unico).
--
-- A proteção anti-duplicação do fluxo AUTOMÁTICO mantém-se intacta: o índice
-- único continua a aplicar-se às cobranças não-manuais.
-- ============================================================

-- 1) Flag de cobrança manual (fatura adicional com linhas livres).
ALTER TABLE public.contrato_cobrancas
  ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contrato_cobrancas.manual IS
  'true = fatura adicional criada à mão ("Nova Fatura") com linhas livres. '
  'Fica fora do índice único de período (permite várias faturas por contrato).';

-- 2) Índice único de período só para cobranças automáticas (não-manuais).
--    Mantém a proteção contra duplicar a faturação automática, mas deixa
--    criar quantas faturas manuais forem precisas no mesmo período.
DROP INDEX IF EXISTS public.contrato_cobrancas_periodo_unico;

CREATE UNIQUE INDEX IF NOT EXISTS contrato_cobrancas_periodo_unico
  ON public.contrato_cobrancas (contrato_id, destinatario_id, periodo_de, periodo_ate)
  WHERE estado <> 'anulada' AND manual = false;
