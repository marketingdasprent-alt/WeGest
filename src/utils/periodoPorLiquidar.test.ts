import { describe, it, expect } from 'vitest';
import { datasDoPeriodo, periodoDasDatas } from './periodoPorLiquidar';

const hoje = new Date(2026, 9, 29); // 29-10-2026

describe('datasDoPeriodo', () => {
  it.each([
    ['este-mes', { de: '2026-10-01', ate: '2026-10-29' }],
    ['mes-passado', { de: '2026-09-01', ate: '2026-09-30' }],
    ['90-dias', { de: '2026-07-31', ate: '2026-10-29' }],
    ['tudo', { de: '', ate: '' }],
  ] as const)('%s', (p, esperado) => {
    expect(datasDoPeriodo(p, hoje)).toEqual(esperado);
  });

  it('mês passado em janeiro é dezembro do ano anterior', () => {
    expect(datasDoPeriodo('mes-passado', new Date(2027, 0, 15))).toEqual({
      de: '2026-12-01',
      ate: '2026-12-31',
    });
  });
});

describe('periodoDasDatas', () => {
  it('reconhece o atalho pelas datas', () => {
    expect(periodoDasDatas('2026-10-01', '2026-10-29', hoje)).toBe('este-mes');
    expect(periodoDasDatas('', '', hoje)).toBe('tudo');
  });

  it('datas escolhidas à mão são personalizado', () => {
    expect(periodoDasDatas('2026-10-05', '2026-10-20', hoje)).toBe('personalizado');
  });
});
