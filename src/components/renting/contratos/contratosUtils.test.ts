import { describe, it, expect } from 'vitest';
import {
  getContratoTotal,
  normalizeMatricula,
  csvEscape,
  matchesCodigo,
  formatDateTime,
} from './contratosUtils';

describe('getContratoTotal', () => {
  it('prioriza total_calculado (tempo real, com extras/IVA)', () => {
    expect(
      getContratoTotal({
        total_calculado: 1500,
        total_final: null,
        valor_total_manual: 1000,
      })
    ).toBe(1500);
  });

  it('usa snapshot total_final quando não há calculado (facturado)', () => {
    expect(
      getContratoTotal({
        total_calculado: null,
        total_final: 1234.56,
        valor_total_manual: 1000,
      })
    ).toBe(1234.56);
  });

  it('fallback para valor_total_manual quando nada mais existe', () => {
    expect(
      getContratoTotal({
        total_calculado: null,
        total_final: null,
        valor_total_manual: 800,
      })
    ).toBe(800);
  });

  it('devolve null quando todos indisponíveis', () => {
    expect(
      getContratoTotal({
        total_calculado: null,
        total_final: null,
        valor_total_manual: null,
      })
    ).toBeNull();
  });
});

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
    expect(matchesCodigo(5851, '585')).toBe(false);
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
    expect(formatDateTime('2026-07-28T12:09:00')).toBe('2026-07-28 12:09');
  });

  it('null/undefined dá "—" em vez da data zero do Unix (1970-01-01) — contratos regime Slot/TVDE sem data_fim', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });
});

describe('csvEscape', () => {
  it('envolve em aspas quando tem vírgula', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });
  it('escapa aspas duplas', () => {
    expect(csvEscape('a"b')).toBe('"a""b"');
  });
  it('devolve string vazia para null', () => {
    expect(csvEscape(null)).toBe('');
  });
});
