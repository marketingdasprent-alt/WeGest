// Corpo do insertReceipt do KeyInvoice. TS puro, sem APIs de Deno: usado pela
// edge function faturacao-emitir e testado pelo Vitest (src/lib/reciboKeyinvoice.test.ts).

export interface DocumentoALiquidar {
  doctype: string;
  serie: string;
  docnum: string;
}

/**
 * A série do recibo vai em `ReceiptSeries` (documentação do insertReceipt, lida
 * a 2026-10-27). Sem ela o KeyInvoice usa a série da chave API, que na conta da
 * Dasp Rent Sul não existe. `DocSeries` só existe dentro de cada linha: é a série
 * da fatura que se liquida.
 */
export function corpoInsertReceipt(
  serieRecibo: string | number | null | undefined,
  original: DocumentoALiquidar,
  valor: number,
  cliente: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...(serieRecibo ? { ReceiptSeries: String(serieRecibo) } : {}),
    DocLines: [
      {
        DocType: String(original.doctype),
        DocSeries: String(original.serie),
        DocNum: String(original.docnum),
        SettleValue: String(Math.round(valor * 100) / 100),
      },
    ],
    ...cliente,
  };
}
