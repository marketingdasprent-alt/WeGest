import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatNumber,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatPercentage,
  formatMatricula,
} from './formatters';

describe('formatCurrency', () => {
  it('formata valores como moeda EUR', () => {
    const result = formatCurrency(1500);
    expect(result).toContain('€');
    expect(result).toContain('1500');
    expect(result).toContain('00');
  });

  it('retorna 0,00 para valores null ou undefined', () => {
    expect(formatCurrency(null)).toBe('€0,00');
    expect(formatCurrency(undefined)).toBe('€0,00');
  });

  it('formata valores negativos', () => {
    expect(formatCurrency(-50.99)).toBe('€-50,99');
  });
});

describe('formatNumber', () => {
  it('formata números inteiros', () => {
    const result = formatNumber(1500);
    expect(result).toContain('1500');
  });

  it('formata números com decimais', () => {
    const result = formatNumber(100.5, 2);
    expect(result).toContain('100');
    expect(result).toContain('50');
  });

  it('retorna 0 para null ou undefined', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
  });
});

describe('formatDate', () => {
  it('formata datas ISO como DD/MM/YYYY', () => {
    expect(formatDate('2026-06-15')).toBe('15/06/2026');
    expect(formatDate('2025-01-01')).toBe('01/01/2025');
  });

  it('formata objetos Date', () => {
    const date = new Date('2026-06-15T00:00:00Z');
    expect(formatDate(date)).toMatch(/15\/06\/2026/);
  });

  it('retorna — para datas inválidas ou null', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('invalid-date')).toBe('—');
  });

  it('aceita formato customizado', () => {
    expect(formatDate('2026-06-15', 'yyyy-MM-dd')).toBe('2026-06-15');
  });
});

describe('formatDateLong', () => {
  it('formata datas em formato longo PT', () => {
    const result = formatDateLong('2026-06-15');
    expect(result).toMatch(/15.*junho.*2026/i);
  });

  it('retorna — para datas inválidas', () => {
    expect(formatDateLong(null)).toBe('—');
    expect(formatDateLong('invalid')).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('formata data e hora juntas', () => {
    const result = formatDateTime('2026-06-15T14:30:00Z');
    expect(result).toContain('15/06/2026');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('retorna — para valores inválidos', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('formatPercentage', () => {
  it('formata percentagens com 1 casa decimal', () => {
    const result = formatPercentage(50);
    expect(result).toContain('%');
    expect(result).toContain('50');
  });

  it('formata com decimais customizados', () => {
    const result = formatPercentage(50, 0);
    expect(result).toBe('50%');
  });

  it('retorna 0% para null ou undefined', () => {
    expect(formatPercentage(null)).toBe('0%');
    expect(formatPercentage(undefined)).toBe('0%');
  });
});

describe('formatMatricula', () => {
  it('formata matrículas de viaturas com hífens', () => {
    const result = formatMatricula('AB12CD');
    expect(result).toContain('-');
    expect(result).toContain('12');
  });

  it('remove hífens e espaços antes de reformatar', () => {
    expect(formatMatricula('ab-12-cd')).toBe('AB-12-CD');
    expect(formatMatricula('ab 12 cd')).toBe('AB-12-CD');
    expect(formatMatricula('AB-12-CD')).toBe('AB-12-CD');
  });

  it('retorna como está se não tiver 6 caracteres', () => {
    expect(formatMatricula('ab12')).toBe('AB-12');
    expect(formatMatricula('abcdefghij')).toBe('AB-CD-EF-GH-IJ');
  });
});
