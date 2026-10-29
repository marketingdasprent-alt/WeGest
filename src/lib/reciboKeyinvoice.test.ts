import { describe, it, expect } from 'vitest';
// TS puro, sem APIs de Deno: a edge function e o Vitest usam o mesmo ficheiro.
import { corpoInsertReceipt } from '../../supabase/functions/_shared/faturacao/recibo';

const fatura = { doctype: '4', serie: '67', docnum: '94' };

describe('corpoInsertReceipt', () => {
  it('segue a documentação do KeyInvoice: série do recibo em ReceiptSeries, a da fatura na linha', () => {
    expect(corpoInsertReceipt('70', fatura, 6.3, { IdClient: '1005' })).toEqual({
      ReceiptSeries: '70',
      DocLines: [{ DocType: '4', DocSeries: '67', DocNum: '94', SettleValue: '6.3' }],
      IdClient: '1005',
    });
  });

  it('nunca manda DocSeries no topo — o KeyInvoice não o conhece no insertReceipt', () => {
    expect(corpoInsertReceipt('70', fatura, 1, {})).not.toHaveProperty('DocSeries');
  });

  it('sem série configurada deixa o KeyInvoice usar a da chave API', () => {
    expect(corpoInsertReceipt(undefined, fatura, 1, {})).not.toHaveProperty('ReceiptSeries');
  });

  it('arredonda o valor ao cêntimo', () => {
    const corpo = corpoInsertReceipt('70', fatura, 1371.4500000001, {});
    expect((corpo.DocLines as { SettleValue: string }[])[0].SettleValue).toBe('1371.45');
  });
});
