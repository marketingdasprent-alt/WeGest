import { describe, it, expect } from 'vitest';

import { calcularKmExcedente } from './kmExcedente';

const base = { kmSaida: 10000, kmsIncluidos: 2000, kmAdicionalValor: 0.125 };

describe('calcularKmExcedente', () => {
  it('cobra só os km acima do limite', () => {
    expect(calcularKmExcedente({ ...base, kmEntrada: 12500 })).toEqual({
      kmPercorridos: 2500,
      kmExcedente: 500,
      valor: 62.5,
    });
  });

  it('arredonda o valor a cêntimos', () => {
    expect(calcularKmExcedente({ ...base, kmEntrada: 12833 })?.valor).toBe(104.13);
  });

  it('no limite ou abaixo não cobra nada', () => {
    expect(calcularKmExcedente({ ...base, kmEntrada: 12000 })).toEqual({
      kmPercorridos: 2000,
      kmExcedente: 0,
      valor: 0,
    });
    expect(calcularKmExcedente({ ...base, kmEntrada: 11500 })?.valor).toBe(0);
  });

  it('km ilimitados ou sem preço por km não cobram', () => {
    expect(calcularKmExcedente({ ...base, kmsIncluidos: null, kmEntrada: 19000 })?.valor).toBe(0);
    expect(calcularKmExcedente({ ...base, kmAdicionalValor: null, kmEntrada: 19000 })?.valor).toBe(
      0
    );
  });

  it('sem km de saída, sem km de entrada ou com o km a descer não há conta', () => {
    expect(calcularKmExcedente({ ...base, kmSaida: null, kmEntrada: 12500 })).toBeNull();
    expect(calcularKmExcedente({ ...base, kmEntrada: null })).toBeNull();
    expect(calcularKmExcedente({ ...base, kmEntrada: Number.NaN })).toBeNull();
    expect(calcularKmExcedente({ ...base, kmEntrada: 9000 })).toBeNull();
  });
});
