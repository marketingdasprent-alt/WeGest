import { describe, it, expect } from 'vitest';
import {
  round2,
  periodoMesSeguinte,
  periodoStubEntrada,
  periodoMes,
  valorStub,
  cobrancaMensalDoMes,
  repartirIva,
} from './slotBilling';

// Datas construídas em hora local a partir de y/m/d (mês 0-indexado).
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('round2', () => {
  it('arredonda a 2 casas', () => {
    expect(round2(80.005)).toBe(80.01);
    expect(round2(13.3333)).toBe(13.33);
  });
});

describe('periodoMesSeguinte', () => {
  it('entrada 25 jun 2026 → julho inteiro', () => {
    expect(periodoMesSeguinte(d(2026, 6, 25))).toEqual({ de: '2026-07-01', ate: '2026-07-31' });
  });
  it('entrada 31 dez 2026 → janeiro 2027', () => {
    expect(periodoMesSeguinte(d(2026, 12, 31))).toEqual({ de: '2027-01-01', ate: '2027-01-31' });
  });
});

describe('periodoStubEntrada', () => {
  it('25 jun → 6 dias (inclui entrada), mês de 30', () => {
    expect(periodoStubEntrada(d(2026, 6, 25))).toEqual({
      periodo: { de: '2026-06-25', ate: '2026-06-30' },
      dias: 6,
      diasDoMes: 30,
    });
  });
  it('1 jun → mês inteiro (30 dias)', () => {
    expect(periodoStubEntrada(d(2026, 6, 1))).toEqual({
      periodo: { de: '2026-06-01', ate: '2026-06-30' },
      dias: 30,
      diasDoMes: 30,
    });
  });
  it('30 jun → 1 dia', () => {
    expect(periodoStubEntrada(d(2026, 6, 30)).dias).toBe(1);
  });
});

describe('periodoMes', () => {
  it('agosto 2026', () => {
    expect(periodoMes(d(2026, 8, 3))).toEqual({ de: '2026-08-01', ate: '2026-08-31' });
  });
});

describe('valorStub', () => {
  it('400 bruto, entrada 25 jun → 80', () => {
    expect(valorStub(400, d(2026, 6, 25))).toBe(80);
  });
  it('400 bruto, entrada 30 jun → 13.33', () => {
    expect(valorStub(400, d(2026, 6, 30))).toBe(13.33);
  });
});

describe('cobrancaMensalDoMes', () => {
  const entrada = d(2026, 6, 25);
  it('ref no mês de entrada (M) → nenhum', () => {
    expect(cobrancaMensalDoMes(entrada, d(2026, 6, 28), 400)).toEqual({
      tipo: 'nenhum',
      periodo: null,
      valor: 0,
    });
  });
  it('ref em M+1 (julho) → stub de junho (80)', () => {
    expect(cobrancaMensalDoMes(entrada, d(2026, 7, 6), 400)).toEqual({
      tipo: 'stub',
      periodo: { de: '2026-06-25', ate: '2026-06-30' },
      valor: 80,
    });
  });
  it('ref em M+2 (agosto) → mensal cheio (400)', () => {
    expect(cobrancaMensalDoMes(entrada, d(2026, 8, 3), 400)).toEqual({
      tipo: 'mensal',
      periodo: { de: '2026-08-01', ate: '2026-08-31' },
      valor: 400,
    });
  });
});

describe('repartirIva', () => {
  it('400 com IVA 23 → base 325.20 + 74.80', () => {
    expect(repartirIva(400, 23)).toEqual({ semIva: 325.2, iva: 74.8, total: 400 });
  });
  it('80 com IVA 23 → base 65.04 + 14.96', () => {
    expect(repartirIva(80, 23)).toEqual({ semIva: 65.04, iva: 14.96, total: 80 });
  });
});
