import { describe, it, expect, vi } from 'vitest';
import { fmtDay, capitalize, emptyResumo, getWeekShortcuts, round2, weekLabel } from './financeiro';

describe('fmtDay', () => {
  it('formata Date como yyyy-MM-dd', () => {
    const d = new Date(2026, 6, 10); // 10 Jul 2026
    expect(fmtDay(d)).toBe('2026-07-10');
  });

  it('usa dois dígitos para mês e dia', () => {
    const d = new Date(2026, 0, 5); // 5 Jan 2026
    expect(fmtDay(d)).toBe('2026-01-05');
  });
});

describe('capitalize', () => {
  it('capitaliza primeira letra', () => {
    expect(capitalize('julho')).toBe('Julho');
  });

  it('deixa string vazia igual', () => {
    expect(capitalize('')).toBe('');
  });

  it('lida com uma letra', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('não altera maiúsculas existentes', () => {
    expect(capitalize('Julho')).toBe('Julho');
  });
});

describe('emptyResumo', () => {
  it('retorna ResumoFinanceiro com zeros', () => {
    const r = emptyResumo();
    expect(r).toEqual({ valor: 0, count: 0, dateLabel: '' });
  });

  it('aceita dateLabel opcional', () => {
    const r = emptyResumo('Julho');
    expect(r.dateLabel).toBe('Julho');
  });
});

describe('getWeekShortcuts', () => {
  it('retorna 4 atalhos de semanas', () => {
    const shortcuts = getWeekShortcuts();
    expect(shortcuts).toHaveLength(4);
  });

  it('cada atalho tem label e date', () => {
    const shortcuts = getWeekShortcuts();
    shortcuts.forEach((s) => {
      expect(s).toHaveProperty('label');
      expect(s).toHaveProperty('date');
      expect(s.date).toBeInstanceOf(Date);
    });
  });

  it('primeiro é "Esta semana"', () => {
    const shortcuts = getWeekShortcuts();
    expect(shortcuts[0].label).toBe('Esta semana');
  });

  it('segundo é "Semana passada"', () => {
    const shortcuts = getWeekShortcuts();
    expect(shortcuts[1].label).toBe('Semana passada');
  });
});

describe('round2', () => {
  it('arredonda para 2 casas decimais', () => {
    expect(round2(10.456)).toBe(10.46);
    expect(round2(10.454)).toBe(10.45);
  });

  it('lida com inteiros', () => {
    expect(round2(10)).toBe(10);
  });

  it('lida com zero', () => {
    expect(round2(0)).toBe(0);
  });

  it('lida com negativos', () => {
    expect(round2(-10.456)).toBe(-10.46);
  });

  it('lida com null/undefined via Number()', () => {
    expect(round2(null as unknown as number)).toBe(0);
    expect(round2(undefined as unknown as number)).toBe(0);
  });
});

describe('weekLabel', () => {
  it('formata label da semana', () => {
    const fmtMock = (d: Date, f: string) => {
      if (f === 'dd/MM') return '10/07';
      if (f === 'dd/MM/yyyy') return '16/07/2026';
      return '';
    };
    const start = new Date(2026, 6, 10);
    const end = new Date(2026, 6, 16);
    expect(weekLabel(start, end, false, fmtMock)).toBe('10/07 - 16/07/2026');
  });

  it('adiciona "(Semana Actual)" quando isCurrent', () => {
    const fmtMock = (d: Date, f: string) => {
      if (f === 'dd/MM') return '10/07';
      if (f === 'dd/MM/yyyy') return '16/07/2026';
      return '';
    };
    const d = new Date();
    expect(weekLabel(d, d, true, fmtMock)).toBe('10/07 - 16/07/2026 (Semana Actual)');
  });
});
