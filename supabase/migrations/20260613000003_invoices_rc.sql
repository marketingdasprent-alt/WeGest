-- ============================================================
-- Espelho de faturação: aceitar o tipo Recibo (RC)
-- ============================================================
-- O recibo fiscal (RC) emitido no KeyInvoice (contra uma FT já emitida)
-- é espelhado em public.invoices, tal como FT/FR/NC.
-- ============================================================

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_tipo_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_tipo_check CHECK (tipo IN ('FT', 'FR', 'NC', 'RC'));
