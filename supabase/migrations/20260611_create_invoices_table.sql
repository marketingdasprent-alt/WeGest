-- Tabela para armazenar metadata de faturas criadas no KeyInvoice
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  contrato_id UUID NOT NULL REFERENCES contratos_renting(id) ON DELETE CASCADE,
  tipo VARCHAR(2) NOT NULL CHECK (tipo IN ('FT', 'FR', 'NC')), -- Fatura, Fatura-Recibo, Nota de Crédito
  keyinvoice_numero VARCHAR(50) NOT NULL,
  keyinvoice_serie VARCHAR(10),
  keyinvoice_data DATE,
  url_pdf TEXT,
  total DECIMAL(10, 2),
  referencia_externa TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_invoices_org_id ON invoices(org_id);
CREATE INDEX idx_invoices_contrato_id ON invoices(contrato_id);
CREATE INDEX idx_invoices_tipo ON invoices(tipo);
CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC);

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoices of their org" ON invoices
  FOR SELECT
  USING (org_id = public.get_current_org_id());

CREATE POLICY "Users can insert invoices in their org" ON invoices
  FOR INSERT
  WITH CHECK (org_id = public.get_current_org_id());

CREATE POLICY "Users can update invoices of their org" ON invoices
  FOR UPDATE
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id = public.get_current_org_id());
