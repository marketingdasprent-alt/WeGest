import { describe, it, expect } from 'vitest';
import { formatDateTime, matchesCodigo, normalizeMatricula } from './reservasUtils';

describe('normalizeMatricula', () => {
  it('lowercase + remove hífens e espaços', () => {
    expect(normalizeMatricula('AB-12-CD')).toBe('ab12cd');
    expect(normalizeMatricula('AB 12 CD')).toBe('ab12cd');
  });
});

describe('matchesCodigo', () => {
  it('faz match exato quando pesquisa é o próprio código', () => {
    expect(matchesCodigo(585, '585')).toBe(true);
  });

  it('não faz match de código que apenas contém a substring pesquisada', () => {
    expect(matchesCodigo(1585, '585')).toBe(false);
    expect(matchesCodigo(5850, '585')).toBe(false);
  });

  it('ignora zeros à esquerda na pesquisa', () => {
    expect(matchesCodigo(585, '0585')).toBe(true);
  });

  it('não faz match quando pesquisa não é numérica', () => {
    expect(matchesCodigo(585, 'abc')).toBe(false);
  });
});

describe('formatDateTime', () => {
  it('formata uma data ISO válida', () => {
    expect(formatDateTime('2026-07-28T12:09:00')).toBe('2026-07-28 12:09:00');
  });

  it('null/undefined dá "—" em vez da data zero do Unix (1970-01-01)', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });
});
