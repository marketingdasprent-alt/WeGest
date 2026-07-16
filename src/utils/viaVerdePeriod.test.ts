import { describe, it, expect } from 'vitest';
import { calcularSemanaAnterior } from './viaVerdePeriod';

describe('calcularSemanaAnterior', () => {
  it('retorna segunda a domingo da semana anterior quando hoje é segunda', () => {
    // 13/07/2026 é segunda-feira
    const ref = new Date('2026-07-13T04:00:00Z');
    const periodo = calcularSemanaAnterior(ref);
    expect(periodo.inicio).toBe('2026-07-06');
    expect(periodo.fim).toBe('2026-07-12');
  });

  it('retorna segunda a domingo da semana anterior quando hoje é quarta', () => {
    // 15/07/2026 é quarta-feira
    const ref = new Date('2026-07-15T10:00:00Z');
    const periodo = calcularSemanaAnterior(ref);
    expect(periodo.inicio).toBe('2026-07-06');
    expect(periodo.fim).toBe('2026-07-12');
  });

  it('retorna segunda a domingo da semana anterior quando hoje é domingo', () => {
    // 12/07/2026 é domingo — semana anterior deve ser 29/06 a 05/07
    const ref = new Date('2026-07-12T22:00:00Z');
    const periodo = calcularSemanaAnterior(ref);
    expect(periodo.inicio).toBe('2026-06-29');
    expect(periodo.fim).toBe('2026-07-05');
  });

  it('retorna segunda a domingo quando hoje é sábado', () => {
    // 11/07/2026 é sábado — semana actual ainda não terminou,
    // logo semana anterior completa é 29/06 a 05/07
    const ref = new Date('2026-07-11T12:00:00Z');
    const periodo = calcularSemanaAnterior(ref);
    expect(periodo.inicio).toBe('2026-06-29');
    expect(periodo.fim).toBe('2026-07-05');
  });

  it('travessa limite de mês correctamente', () => {
    // 03/08/2026 é segunda-feira — semana anterior: 27/07 a 02/08
    const ref = new Date('2026-08-03T04:00:00Z');
    const periodo = calcularSemanaAnterior(ref);
    expect(periodo.inicio).toBe('2026-07-27');
    expect(periodo.fim).toBe('2026-08-02');
  });

  it('travessa limite de ano correctamente', () => {
    // 05/01/2026 é segunda-feira — semana anterior: 28/12/2025 a 03/01/2026
    const ref = new Date('2026-01-05T04:00:00Z');
    const periodo = calcularSemanaAnterior(ref);
    expect(periodo.inicio).toBe('2025-12-29');
    expect(periodo.fim).toBe('2026-01-04');
  });

  it('sempre produz 7 dias de diferença entre inicio e fim', () => {
    for (let i = 0; i < 7; i++) {
      const ref = new Date(`2026-07-${13 + i}T04:00:00Z`);
      const { inicio, fim } = calcularSemanaAnterior(ref);
      const diffMs = new Date(fim).getTime() - new Date(inicio).getTime();
      expect(diffMs).toBe(6 * 86400000);
    }
  });
});
