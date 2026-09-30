-- ============================================================
-- Cada documento fiscal lembra-se da integração que o emitiu
-- ============================================================
-- O PDF e a anulação de recibo escolhiam a conta pela empresa do contrato.
-- Isso só é verdade para documentos emitidos DEPOIS de 17-09 (migração
-- 20260917150000): as 201 facturas anteriores foram todas emitidas por uma só
-- chave, a da conta "Empresa DEMO" — que hoje é a integração da Dasprent Rent
-- A Car. Pedidas à conta da Dasp Rent Sul, o KeyInvoice responde "Documento
-- inválido" e o PDF não abre.
--
-- A conta em que um documento vive não muda depois de emitido, por isso fica
-- gravada no próprio documento. ON DELETE RESTRICT: apagar a integração
-- deixaria documentos sem forma de os consultar.
-- ============================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS integracao_id uuid
    REFERENCES public.plataformas_configuracao (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.invoices.integracao_id IS
  'Integração de faturação (plataformas_configuracao) em cuja conta o documento foi emitido. PDF e anulação usam esta chave, não a da empresa do contrato. Nulo em documentos anteriores sem integração conhecida.';

CREATE INDEX IF NOT EXISTS idx_invoices_integracao_id
  ON public.invoices (integracao_id)
  WHERE integracao_id IS NOT NULL;

-- Backfill: tudo o que o KeyInvoice emitiu antes da faturação por empresa
-- saiu da conta DEMO. Confirmado a 2026-09-23 com getDocument/company contra
-- as duas chaves. Só corre onde essa integração existe (produção).
UPDATE public.invoices i
   SET integracao_id = pc.id
  FROM public.plataformas_configuracao pc
 WHERE pc.id = 'ca1826d6-cbfc-4fa5-b091-4bf41d38a243'
   AND pc.plataforma = 'faturacao'
   AND pc.org_id = i.org_id
   AND i.integracao_id IS NULL
   AND i.provider = 'keyinvoice'
   AND i.created_at < '2026-09-17 17:15:02+00';

NOTIFY pgrst, 'reload schema';
