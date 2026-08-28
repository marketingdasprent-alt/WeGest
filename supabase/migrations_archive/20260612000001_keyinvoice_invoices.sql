-- ============================================================
-- Documentos fiscais emitidos no KeyInvoice (espelho local)
-- ============================================================
-- Cada linha = um documento (Fatura, Fatura-Recibo, Nota de Crédito)
-- emitido no KeyInvoice via edge function `keyinvoice-emitir`.
-- A conta-corrente local continua a ser a fonte de verdade; esta tabela
-- guarda apenas a referência ao documento legal + PDF para consulta.
--
-- NOTA: substitui a migração 20260611_create_invoices_table.sql (nunca
-- aplicada, nome malformado, org_id NOT NULL sem trigger).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  -- Documento fiscal NÃO desaparece se o contrato for apagado (SAF-T)
  contrato_id     UUID REFERENCES public.contratos_renting(id) ON DELETE SET NULL,
  cobranca_id     UUID REFERENCES public.contrato_cobrancas(id) ON DELETE SET NULL,

  tipo            VARCHAR(4) NOT NULL CHECK (tipo IN ('FT', 'FR', 'NC')),

  -- Identificação devolvida pelo KeyInvoice (API5: insertDocument -> Data)
  ki_doctype      TEXT,        -- DocType numérico do KeyInvoice (ex.: "4")
  ki_docnum       TEXT,        -- DocNum (nº do documento; usado no getDocumentPDF)
  serie           TEXT,        -- DocSeries (id da série)
  numero          TEXT,        -- FullDocNumber (nº legal apresentável, ex.: "FT A/1001")
  data_emissao    DATE,

  total           NUMERIC(12, 2),
  cliente_nif     TEXT,
  referencia_externa TEXT,     -- ex.: "Contrato #0012"
  observacoes     TEXT,

  -- 'emitida' (sucesso) | 'erro' (falhou no KeyInvoice) | 'anulada'
  status          TEXT NOT NULL DEFAULT 'emitida' CHECK (status IN ('emitida', 'erro', 'anulada')),
  erro_msg        TEXT,
  raw_response    JSONB,       -- auditoria da resposta do KeyInvoice

  created_by      UUID DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_org_id      ON public.invoices (org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contrato_id ON public.invoices (contrato_id);
CREATE INDEX IF NOT EXISTS idx_invoices_cobranca_id ON public.invoices (cobranca_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at  ON public.invoices (created_at DESC);

-- ------------------------------------------------------------
-- Trigger: preencher org_id automaticamente
--   1) a partir do contrato, se houver;
--   2) senão, da sessão (get_current_org_id()).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_invoice_org_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    IF NEW.contrato_id IS NOT NULL THEN
      SELECT org_id INTO NEW.org_id FROM public.contratos_renting WHERE id = NEW.contrato_id;
    END IF;
    IF NEW.org_id IS NULL THEN
      NEW.org_id := public.get_current_org_id();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_set_org_id ON public.invoices;
CREATE TRIGGER trg_invoices_set_org_id
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_org_id();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- RLS — multi-tenant + acesso a contratos renting
-- ------------------------------------------------------------
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_invoices_select" ON public.invoices;
DROP POLICY IF EXISTS "mt_invoices_insert" ON public.invoices;
DROP POLICY IF EXISTS "mt_invoices_update" ON public.invoices;
DROP POLICY IF EXISTS "mt_invoices_delete" ON public.invoices;

CREATE POLICY "mt_invoices_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_contratos_access());

CREATE POLICY "mt_invoices_insert" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND has_renting_contratos_access()
  );

CREATE POLICY "mt_invoices_update" ON public.invoices
  FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND has_renting_contratos_access());

-- Documentos fiscais não se apagam; só registos que falharam a emissão.
CREATE POLICY "mt_invoices_delete" ON public.invoices
  FOR DELETE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND has_renting_contratos_access()
    AND status = 'erro'
  );

COMMENT ON TABLE public.invoices IS
  'Espelho local dos documentos fiscais emitidos no KeyInvoice (FT/FR/NC). '
  'A conta-corrente local é a fonte de verdade; aqui guarda-se a referência legal + PDF.';
