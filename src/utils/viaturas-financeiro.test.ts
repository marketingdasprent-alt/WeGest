import { describe, it, expect } from 'vitest';
import {
  calculateTotalViatura,
  calculateDepreciationSchedule,
  calculateRestanteFinanciamento,
} from './viaturas-financeiro';

describe('calculateTotalViatura', () => {
  it('returns 0 when all values empty', () => {
    expect(calculateTotalViatura()).toBe(0);
  });

  it('returns subtotal when IVA is ISENTO', () => {
    const result = calculateTotalViatura('10000', '500', '200', '300', 'ISENTO');
    expect(result).toBe(11000);
  });

  it('applies 23% IVA when selected', () => {
    const result = calculateTotalViatura('10000', '0', '0', '0', '23%');
    expect(result).toBe(12300);
  });

  it('applies 13% IVA when selected', () => {
    const result = calculateTotalViatura('10000', '0', '0', '0', '13%');
    expect(result).toBeCloseTo(11300, 2);
  });

  it('applies 6% IVA when selected', () => {
    const result = calculateTotalViatura('10000', '0', '0', '0', '6%');
    expect(result).toBe(10600);
  });

  it('handles null values gracefully', () => {
    const result = calculateTotalViatura(null, null, null, null, null);
    expect(result).toBe(0);
  });

  it('rounds properly with multiple cost components', () => {
    const result = calculateTotalViatura('15000', '1200.50', '350.75', '400.25', '23%');
    // subtotal = 16951.50, * 1.23 = 20850.345
    expect(result).toBeCloseTo(20850.345, 2);
  });
});

describe('calculateDepreciationSchedule', () => {
  it('returns empty array when cost is 0', () => {
    expect(calculateDepreciationSchedule(0, 5)).toEqual([]);
  });

  it('returns empty array when years is 0', () => {
    expect(calculateDepreciationSchedule(10000, 0)).toEqual([]);
  });

  it('calculates linear depreciation correctly', () => {
    const result = calculateDepreciationSchedule(10000, 5, 'linear');
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ ano: 1, depreciacaoAnual: 2000, valorContabil: 8000 });
    expect(result[4]).toEqual({ ano: 5, depreciacaoAnual: 2000, valorContabil: 0 });
  });

  it('calculates double declining balance correctly', () => {
    const result = calculateDepreciationSchedule(10000, 5, 'reducao_dupla');
    expect(result).toHaveLength(5);
    // rate = 2/5 = 0.4
    // Year 1: 10000 * 0.4 = 4000, book = 6000
    expect(result[0].ano).toBe(1);
    expect(result[0].depreciacaoAnual).toBe(4000);
    expect(result[0].valorContabil).toBe(6000);
  });

  it('calculates sum-of-years-digits correctly', () => {
    const result = calculateDepreciationSchedule(10000, 5, 'soma_digitos');
    expect(result).toHaveLength(5);
    // sum = 15
    // Year 1: (5/15) * 10000 = 3333.33...
    expect(result[0].ano).toBe(1);
    expect(result[0].depreciacaoAnual).toBeCloseTo(3333.33, 1);
  });

  it('uses linear method as default', () => {
    const result = calculateDepreciationSchedule(10000, 2);
    expect(result).toHaveLength(2);
    expect(result[0].depreciacaoAnual).toBe(5000);
  });
});

describe('calculateRestanteFinanciamento', () => {
  it('returns N/A for sem_financiamento', () => {
    expect(calculateRestanteFinanciamento('sem_financiamento', '2024-01-01', 48)).toBe('N/A');
  });

  it('returns N/A for null tipo', () => {
    expect(calculateRestanteFinanciamento(null, '2024-01-01', 48)).toBe('N/A');
  });

  it('returns 0 when start date is missing', () => {
    expect(calculateRestanteFinanciamento('leasing', null, 48)).toBe('0');
  });

  it('returns 0 when total prestacoes is 0', () => {
    expect(calculateRestanteFinanciamento('leasing', '2024-01-01', 0)).toBe('0');
  });
});
