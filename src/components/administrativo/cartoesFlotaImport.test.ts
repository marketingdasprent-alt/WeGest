import { describe, it, expect } from 'vitest';
import { parseTipo, parseExcelDate, colKey } from './cartoesFlotaImport';

describe('parseTipo', () => {
  it('aceita bp/repsol/edp case-insensitive', () => {
    expect(parseTipo('BP')).toBe('bp');
    expect(parseTipo(' Repsol ')).toBe('repsol');
    expect(parseTipo('edp')).toBe('edp');
  });

  it('rejeita tipos desconhecidos', () => {
    expect(parseTipo('galp')).toBe('');
    expect(parseTipo('')).toBe('');
    expect(parseTipo(undefined)).toBe('');
  });
});

describe('parseExcelDate', () => {
  it('converte dd/mm/yyyy para yyyy-mm-dd', () => {
    expect(parseExcelDate('31/12/2026')).toBe('2026-12-31');
  });

  it('mantém yyyy-mm-dd inalterado', () => {
    expect(parseExcelDate('2026-06-30')).toBe('2026-06-30');
  });

  it('devolve string vazia para valor vazio', () => {
    expect(parseExcelDate('')).toBe('');
    expect(parseExcelDate(null)).toBe('');
  });

  it('converte número de série do Excel (44927 = 01/01/2023)', () => {
    expect(parseExcelDate(44927)).toBe('2023-01-01');
  });
});

describe('colKey', () => {
  it('normaliza cabeçalhos: minúsculas, sem acentos, espaços viram underscore', () => {
    expect(colKey('Detentor do Cartão')).toBe('detentor_do_cartao');
    expect(colKey('Validade')).toBe('validade');
    expect(colKey('  Número  ')).toBe('numero');
  });
});
