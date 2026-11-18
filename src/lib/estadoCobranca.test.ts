import { describe, expect, it } from 'vitest';
import { estadoCobrancaDisplay } from './estadoCobranca';

describe('estadoCobrancaDisplay', () => {
  it('mantém "pendente" mesmo com crédito total registado', () => {
    const result = estadoCobrancaDisplay('pendente', 100, 100);
    expect(result.label).toBe('pendente');
    expect(result.totalmenteCreditada).toBe(false);
  });

  it('mantém "anulada" mesmo com crédito total registado', () => {
    const result = estadoCobrancaDisplay('anulada', 100, 100);
    expect(result.label).toBe('anulada');
    expect(result.totalmenteCreditada).toBe(false);
  });

  it('mantém o estado cru quando o crédito é apenas parcial', () => {
    const result = estadoCobrancaDisplay('emitida', 100, 60);
    expect(result.label).toBe('emitida');
    expect(result.totalmenteCreditada).toBe(false);
  });

  it('mostra "Creditada" quando "emitida" tem crédito total', () => {
    const result = estadoCobrancaDisplay('emitida', 100, 100);
    expect(result.label).toBe('Creditada');
    expect(result.totalmenteCreditada).toBe(true);
  });

  it('mostra "Creditada" quando "paga" tem crédito total', () => {
    const result = estadoCobrancaDisplay('paga', 250.5, 250.5);
    expect(result.label).toBe('Creditada');
    expect(result.totalmenteCreditada).toBe(true);
  });

  it('trata crédito ligeiramente abaixo do total como totalmente creditado (tolerância de arredondamento)', () => {
    const result = estadoCobrancaDisplay('emitida', 100, 99.996);
    expect(result.totalmenteCreditada).toBe(true);
  });

  it('não considera totalmente creditado fora da tolerância de arredondamento', () => {
    const result = estadoCobrancaDisplay('emitida', 100, 99.9);
    expect(result.totalmenteCreditada).toBe(false);
  });

  it('nunca fica "Creditada" quando valorTotal é 0 ou nulo/undefined', () => {
    expect(estadoCobrancaDisplay('emitida', 0, 0).totalmenteCreditada).toBe(false);
    expect(estadoCobrancaDisplay('emitida', null, 100).totalmenteCreditada).toBe(false);
    expect(estadoCobrancaDisplay('emitida', undefined, 100).totalmenteCreditada).toBe(false);
  });

  it('trata jaCreditado nulo/undefined como 0', () => {
    const result = estadoCobrancaDisplay('emitida', 100, null);
    expect(result.totalmenteCreditada).toBe(false);
    expect(result.label).toBe('emitida');
  });

  it('cai no className fallback vazio para um estado desconhecido', () => {
    const result = estadoCobrancaDisplay('estado_inexistente', 100, 0);
    expect(result.label).toBe('estado_inexistente');
    expect(result.className).toBe('');
  });
});

describe('estadoCobrancaDisplay: cobrança sem documento fiscal', () => {
  it('"emitida" sem documento fiscal não se chama emitida: não é uma fatura', () => {
    const result = estadoCobrancaDisplay('emitida', 1063.95, 0, true);
    expect(result.label).toBe('Sem fatura fiscal');
    expect(result.semDocumentoFiscal).toBe(true);
    expect(result.totalmenteCreditada).toBe(false);
  });

  it('com documento fiscal continua "emitida"', () => {
    const result = estadoCobrancaDisplay('emitida', 100, 0, false);
    expect(result.label).toBe('emitida');
    expect(result.semDocumentoFiscal).toBe(false);
  });

  it('só se aplica ao estado emitida: anulada e paga mantêm o estado', () => {
    expect(estadoCobrancaDisplay('anulada', 100, 0, true).label).toBe('anulada');
    expect(estadoCobrancaDisplay('paga', 100, 0, true).label).toBe('paga');
  });
});
