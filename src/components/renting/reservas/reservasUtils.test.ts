import { describe, it, expect } from 'vitest';
import { matchesCodigo, normalizeMatricula } from './reservasUtils';

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
