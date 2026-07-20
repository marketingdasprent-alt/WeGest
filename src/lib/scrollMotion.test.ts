import { describe, it, expect } from 'vitest';
import { clampProgress, stepIndexFromProgress, formatCounter } from './scrollMotion';

describe('clampProgress', () => {
  it('mantém valores dentro de 0..1', () => {
    expect(clampProgress(0.5)).toBe(0.5);
  });

  it('encosta a 0 valores negativos', () => {
    expect(clampProgress(-0.3)).toBe(0);
  });

  it('encosta a 1 valores acima de 1', () => {
    expect(clampProgress(1.8)).toBe(1);
  });

  it('trata NaN como 0', () => {
    expect(clampProgress(NaN)).toBe(0);
  });
});

describe('stepIndexFromProgress', () => {
  it('devolve 0 no início', () => {
    expect(stepIndexFromProgress(0, 4)).toBe(0);
  });

  it('devolve o último índice no fim', () => {
    expect(stepIndexFromProgress(1, 4)).toBe(3);
  });

  it('devolve índice intermédio a meio do progresso', () => {
    expect(stepIndexFromProgress(0.5, 4)).toBe(2);
  });

  it('nunca excede totalSteps - 1 mesmo com progresso > 1', () => {
    expect(stepIndexFromProgress(1.5, 4)).toBe(3);
  });

  it('devolve 0 quando totalSteps é 0', () => {
    expect(stepIndexFromProgress(0.7, 0)).toBe(0);
  });
});

describe('formatCounter', () => {
  it('arredonda e formata sem separador abaixo de 10 000', () => {
    expect(formatCounter(999.4)).toBe('999');
  });

  it('usa espaço não separável como separador de milhares a partir de 10 000', () => {
    expect(formatCounter(10000)).toBe('10 000');
    expect(formatCounter(24999.6)).toBe('25 000');
  });
});
