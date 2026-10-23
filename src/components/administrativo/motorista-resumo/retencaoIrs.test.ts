import { describe, it, expect } from 'vitest';
import {
  calcularRetencao,
  levaCorteSeisPorCento,
  percentagem,
  taxasRetencaoDaFicha,
} from './retencaoIrs';

describe('calcularRetencao', () => {
  // Folha da equipa, 2026-10-23: Total líquido 284,96 €.
  it('por omissão IVA 23% por cima e IRS 23% retido: recebe o Total líquido', () => {
    expect(calcularRetencao(284.96)).toEqual({
      totalLiquido: 284.96,
      taxaIva: 0.23,
      iva: 65.54,
      totalDocumento: 350.5,
      taxaIrs: 0.23,
      irs: 65.54,
      totalAReceber: 284.96,
    });
  });

  it('usa as taxas da ficha quando são outras', () => {
    const r = calcularRetencao(1000, { iva: 0.23, irs: 0.115 });
    expect(r.iva).toBe(230);
    expect(r.totalDocumento).toBe(1230);
    expect(r.irs).toBe(115);
    expect(r.totalAReceber).toBe(1115);
  });

  it('aplica-se também a um Total líquido negativo', () => {
    const r = calcularRetencao(-100);
    expect(r.iva).toBe(-23);
    expect(r.totalDocumento).toBe(-123);
    expect(r.irs).toBe(-23);
    expect(r.totalAReceber).toBe(-100);
  });

  it('arredonda ao cêntimo cada linha', () => {
    const r = calcularRetencao(284.9377);
    expect(r.totalLiquido).toBe(284.94);
    expect(r.iva).toBe(65.54);
    expect(r.totalDocumento).toBe(350.48);
    expect(r.totalAReceber).toBe(284.94);
  });
});

describe('taxasRetencaoDaFicha', () => {
  it('sem Retenção ligada não há taxas, mesmo com valores na ficha', () => {
    expect(
      taxasRetencaoDaFicha({ retencao_irs: false, retencao_iva_pct: 23, retencao_irs_pct: 20 })
    ).toBeNull();
  });

  it('converte as percentagens da ficha em fração', () => {
    expect(
      taxasRetencaoDaFicha({ retencao_irs: true, retencao_iva_pct: 23, retencao_irs_pct: 11.5 })
    ).toEqual({ iva: 0.23, irs: 0.115 });
  });

  it('taxa vazia volta aos 23%', () => {
    expect(taxasRetencaoDaFicha({ retencao_irs: true })).toEqual({ iva: 0.23, irs: 0.23 });
  });

  it('aceita a taxa vinda da BD como texto (numeric)', () => {
    expect(
      taxasRetencaoDaFicha({
        retencao_irs: true,
        retencao_iva_pct: '6' as unknown as number,
        retencao_irs_pct: 0,
      })
    ).toEqual({ iva: 0.06, irs: 0 });
  });
});

describe('levaCorteSeisPorCento', () => {
  it('só o verde sem Retenção recebe o valor integral', () => {
    expect(levaCorteSeisPorCento(true, false)).toBe(false);
    expect(levaCorteSeisPorCento(false, false)).toBe(true);
    expect(levaCorteSeisPorCento(true, true)).toBe(true);
    expect(levaCorteSeisPorCento(false, true)).toBe(true);
  });
});

describe('percentagem', () => {
  it('formata a taxa para os rótulos', () => {
    expect(percentagem(0.23)).toBe('23%');
    expect(percentagem(0.115)).toBe('11,5%');
    expect(percentagem(0.07)).toBe('7%');
  });
});
