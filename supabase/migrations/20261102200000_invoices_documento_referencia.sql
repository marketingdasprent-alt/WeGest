-- ============================================================
-- Cada nota de crédito lembra-se da fatura que corrige
-- ============================================================
-- O teto das NC passa a ser o total do documento na KeyInvoice menos o que já se
-- creditou contra ele. Para somar "o que já se creditou" é preciso saber a que fatura
-- cada NC pertence; até aqui só se ligavam pela cobrança, e uma cobrança pode ter
-- mais de uma fatura. Em 10/2026 a conta da Dasp Rent Sul emitiu 15 NC acima da FT.
--
-- Só se liga por cobrança quando ela tem UMA fatura emitida (FT ou FR, não anulada) na mesma org: com duas
-- não há forma de saber qual é a certa e a NC fica por ligar (o servidor conta-a pela
-- cobrança, como antes).
-- ============================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS documento_referencia_id uuid
    REFERENCES public.invoices (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invoices.documento_referencia_id IS
  'Fatura (FT/FR) que esta nota de crédito corrige. Nulo nas NC anteriores a 2026-11-02 cuja cobrança tem mais de uma fatura, e em tudo o que não é NC.';

CREATE INDEX IF NOT EXISTS idx_invoices_documento_referencia_id
  ON public.invoices (documento_referencia_id)
  WHERE documento_referencia_id IS NOT NULL;

-- Função (e não só um UPDATE) para o pgTAP conseguir repetir o backfill sobre dados de teste.
CREATE OR REPLACE FUNCTION public.invoices_ligar_nc_ao_original()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ligadas integer;
BEGIN
  WITH unica AS (
    SELECT org_id, cobranca_id, (array_agg(id))[1] AS id
      FROM public.invoices
     WHERE tipo IN ('FT', 'FR')
       AND status = 'emitida'
       AND cobranca_id IS NOT NULL
     GROUP BY org_id, cobranca_id
    HAVING count(*) = 1
  )
  UPDATE public.invoices nc
     SET documento_referencia_id = u.id
    FROM unica u
   WHERE nc.tipo = 'NC'
     AND nc.documento_referencia_id IS NULL
     AND nc.org_id = u.org_id
     AND nc.cobranca_id = u.cobranca_id;
  GET DIAGNOSTICS v_ligadas = ROW_COUNT;
  RETURN v_ligadas;
END;
$$;

-- Os default privileges dão EXECUTE a anon e authenticated: nomear os três.
REVOKE EXECUTE ON FUNCTION public.invoices_ligar_nc_ao_original() FROM PUBLIC, anon, authenticated;

SELECT public.invoices_ligar_nc_ao_original();

NOTIFY pgrst, 'reload schema';
