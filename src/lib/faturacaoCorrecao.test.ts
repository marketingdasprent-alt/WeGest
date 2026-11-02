import { describe, it, expect } from 'vitest';
// TS puro, sem APIs de Deno: a edge function faturacao-emitir usa o mesmo ficheiro.
import {
  ncsContraOriginal,
  recusaNotaCredito,
  saldoCreditavel,
} from '../../supabase/functions/_shared/faturacao/correcao';

describe('saldoCreditavel', () => {
  it('fatura sem notas de crédito: o saldo é o total do documento na KeyInvoice', () => {
    expect(saldoCreditavel({ totalDocumento: 590, ncsEmitidas: [] })).toBe(590);
  });

  // FT 4 67/15 da Dasp Rent Sul: 1115,00 no documento, NC de 1371,45 já emitida acima dele.
  it('NC maior que o documento deixa o saldo a zero, nunca negativo', () => {
    expect(saldoCreditavel({ totalDocumento: 1115, ncsEmitidas: [1371.45] })).toBe(0);
  });

  it('desconta as notas de crédito já emitidas', () => {
    expect(saldoCreditavel({ totalDocumento: 1115, ncsEmitidas: [868.58] })).toBe(246.42);
    expect(saldoCreditavel({ totalDocumento: 100, ncsEmitidas: [30, 20.5] })).toBe(49.5);
  });

  it('arredonda ao cêntimo, sem ruído de vírgula flutuante', () => {
    expect(saldoCreditavel({ totalDocumento: 0.3, ncsEmitidas: [0.1, 0.1] })).toBe(0.1);
  });

  // Subestimar o já creditado deixava passar uma NC acima do documento: na dúvida, recusa.
  it('valor não numérico lança em vez de contar como zero', () => {
    expect(() => saldoCreditavel({ totalDocumento: 50, ncsEmitidas: [Number.NaN] })).toThrow();
    expect(() => saldoCreditavel({ totalDocumento: Number.NaN, ncsEmitidas: [] })).toThrow();
  });
});

describe('recusaNotaCredito', () => {
  it('aceita um pedido dentro do saldo', () => {
    expect(recusaNotaCredito({ pedido: 246.42, saldo: 246.42 })).toBeNull();
    expect(recusaNotaCredito({ pedido: 100, saldo: 590 })).toBeNull();
  });

  it('aceita até 5 cêntimos acima: é arredondamento por linha', () => {
    expect(recusaNotaCredito({ pedido: 246.47, saldo: 246.42 })).toBeNull();
  });

  it('recusa acima da tolerância e diz o máximo permitido', () => {
    const msg = recusaNotaCredito({ pedido: 725.7, saldo: 590 });
    expect(msg).toContain('725,70');
    expect(msg).toContain('590,00');
    expect(msg).toContain('Nada foi emitido');
  });

  it('com saldo zero recusa qualquer valor e diz que já não há nada a creditar', () => {
    const msg = recusaNotaCredito({ pedido: 1371.45, saldo: 0 });
    expect(msg).toContain('0,00');
  });
});

describe('ncsContraOriginal', () => {
  const original = { id: 'ft-1', cobranca_id: 'cob-1' };

  it('soma as NC ligadas ao original e as antigas da mesma cobrança sem ligação', () => {
    const ncs = [
      { documento_referencia_id: 'ft-1', cobranca_id: 'cob-1', total: 100 },
      { documento_referencia_id: null, cobranca_id: 'cob-1', total: 50 },
    ];
    expect(ncsContraOriginal(original, ncs)).toEqual([100, 50]);
  });

  it('não conta NC ligadas a outro documento, mesmo da mesma cobrança', () => {
    const ncs = [{ documento_referencia_id: 'ft-2', cobranca_id: 'cob-1', total: 80 }];
    expect(ncsContraOriginal(original, ncs)).toEqual([]);
  });

  it('não conta NC antigas de outra cobrança, nem sem cobrança', () => {
    const ncs = [
      { documento_referencia_id: null, cobranca_id: 'cob-2', total: 10 },
      { documento_referencia_id: null, cobranca_id: null, total: 20 },
    ];
    expect(ncsContraOriginal(original, ncs)).toEqual([]);
  });

  it('original sem cobrança só conta as NC ligadas por id', () => {
    const ncs = [
      { documento_referencia_id: 'ft-9', cobranca_id: null, total: 5 },
      { documento_referencia_id: null, cobranca_id: null, total: 7 },
    ];
    expect(ncsContraOriginal({ id: 'ft-9', cobranca_id: null }, ncs)).toEqual([5]);
  });

  it('NC com total nulo ou inválido lança: não se pode contar como zero', () => {
    const nula = [{ documento_referencia_id: 'ft-1', cobranca_id: 'cob-1', total: null }];
    expect(() => ncsContraOriginal(original, nula)).toThrow();
    const nan = [{ documento_referencia_id: null, cobranca_id: 'cob-1', total: Number.NaN }];
    expect(() => ncsContraOriginal(original, nan)).toThrow();
  });

  it('NC sem total de outra fatura não interfere', () => {
    const ncs = [{ documento_referencia_id: 'ft-2', cobranca_id: 'cob-2', total: null }];
    expect(ncsContraOriginal(original, ncs)).toEqual([]);
  });
});
