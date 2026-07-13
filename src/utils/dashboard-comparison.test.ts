import { describe, it, expect } from 'vitest';
import {
  calcularVariacao,
  calcularPeriodoAnterior,
  formatarVariacao,
  type DateRangeFixed,
} from './dashboard-comparison';

describe('calcularVariacao', () => {
  it('calcula variação positiva', () => {
    const result = calcularVariacao(120, 100);
    expect(result.pct).toBe(20);
    expect(result.direction).toBe('up');
    expect(result.hasPrevious).toBe(true);
  });

  it('calcula variação negativa', () => {
    const result = calcularVariacao(80, 100);
    expect(result.pct).toBe(20);
    expect(result.direction).toBe('down');
    expect(result.hasPrevious).toBe(true);
  });

  it('retorna neutral quando actual === previous', () => {
    const result = calcularVariacao(100, 100);
    expect(result.pct).toBe(0);
    expect(result.direction).toBe('neutral');
    expect(result.hasPrevious).toBe(true);
  });

  it('retorna hasPrevious false quando previous é 0', () => {
    const result = calcularVariacao(50, 0);
    expect(result.hasPrevious).toBe(false);
    expect(result.pct).toBe(0);
    expect(result.direction).toBe('up');
  });

  it('retorna neutral quando ambos são 0', () => {
    const result = calcularVariacao(0, 0);
    expect(result.hasPrevious).toBe(false);
    expect(result.direction).toBe('neutral');
    expect(result.pct).toBe(0);
  });

  it('lida com previous negativo (ex: lucro vs prejuízo)', () => {
    // actual = 50 (lucro), previous = -100 (prejuízo)
    // diff = 150, pct = 150 / 100 = 150%
    const result = calcularVariacao(50, -100);
    expect(result.pct).toBe(150);
    expect(result.direction).toBe('up');
    expect(result.hasPrevious).toBe(true);
  });

  it('lida com decimais', () => {
    const result = calcularVariacao(105.5, 100);
    expect(result.pct).toBeCloseTo(5.5, 1);
    expect(result.direction).toBe('up');
  });
});

describe('calcularPeriodoAnterior', () => {
  it('calcula período anterior de mesmo tamanho (1 mês)', () => {
    const range: DateRangeFixed = {
      from: new Date('2025-01-01T00:00:00'),
      to: new Date('2025-01-31T00:00:00'),
    };
    const prev = calcularPeriodoAnterior(range);
    expect(prev.from).toEqual(new Date('2024-12-01T00:00:00'));
    expect(prev.to).toEqual(new Date('2024-12-31T00:00:00'));
  });

  it('calcula período anterior de 7 dias', () => {
    const range: DateRangeFixed = {
      from: new Date('2025-03-10T00:00:00'),
      to: new Date('2025-03-16T00:00:00'),
    };
    const prev = calcularPeriodoAnterior(range);
    // duração = 7 dias (16 - 10 + 1)
    // from anterior = 10 - 7 = 3 Mar
    // to anterior = 10 - 1 = 9 Mar
    expect(prev.from).toEqual(new Date('2025-03-03T00:00:00'));
    expect(prev.to).toEqual(new Date('2025-03-09T00:00:00'));
  });

  it('calcula período anterior de 1 dia', () => {
    const range: DateRangeFixed = {
      from: new Date('2025-06-15T00:00:00'),
      to: new Date('2025-06-15T00:00:00'),
    };
    const prev = calcularPeriodoAnterior(range);
    // duração = 1 dia
    // from anterior = 15 - 1 = 14 Jun
    // to anterior = 15 - 1 = 14 Jun
    expect(prev.from).toEqual(new Date('2025-06-14T00:00:00'));
    expect(prev.to).toEqual(new Date('2025-06-14T00:00:00'));
  });

  it('não se sobrepõe ao período actual', () => {
    const range: DateRangeFixed = {
      from: new Date('2025-01-01T00:00:00'),
      to: new Date('2025-01-31T00:00:00'),
    };
    const prev = calcularPeriodoAnterior(range);
    // O período anterior termina no dia anterior ao início do actual
    expect(prev.to.getTime()).toBeLessThan(range.from.getTime());
  });

  it('mantém a mesma duração em dias', () => {
    const range: DateRangeFixed = {
      from: new Date('2025-01-01T00:00:00'),
      to: new Date('2025-03-31T00:00:00'), // 90 dias
    };
    const prev = calcularPeriodoAnterior(range);
    const actualDays =
      Math.round(
        (range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
    const prevDays =
      Math.round(
        (prev.to.getTime() - prev.from.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
    expect(prevDays).toBe(actualDays);
  });
});

describe('formatarVariacao', () => {
  it('formata variação positiva com sinal +', () => {
    const result = formatarVariacao({ pct: 12.5, direction: 'up', hasPrevious: true });
    expect(result).toBe('+12,5%');
  });

  it('formata variação negativa com sinal -', () => {
    const result = formatarVariacao({ pct: 8.3, direction: 'down', hasPrevious: true });
    expect(result).toBe('-8,3%');
  });

  it('formata variação neutra sem sinal', () => {
    const result = formatarVariacao({ pct: 0, direction: 'neutral', hasPrevious: true });
    expect(result).toBe('0,0%');
  });

  it('retorna string vazia quando hasPrevious é false', () => {
    const result = formatarVariacao({ pct: 0, direction: 'up', hasPrevious: false });
    expect(result).toBe('');
  });

  it('usa vírgula como separador decimal', () => {
    const result = formatarVariacao({ pct: 33.33, direction: 'up', hasPrevious: true });
    expect(result).toContain('33,3');
    expect(result).not.toContain('.');
  });
});
