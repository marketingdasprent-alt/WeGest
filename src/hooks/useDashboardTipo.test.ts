import { describe, it, expect } from 'vitest';
import { decidirDashboardTipo } from './useDashboardTipo';

const base = { isAdmin: false, hasAccessToResource: (_recurso: string) => false };

describe('decidirDashboardTipo', () => {
  it('admin ve sempre a dashboard de frota', () => {
    expect(decidirDashboardTipo({ ...base, isAdmin: true })).toBe('frota');
  });

  it.each(['viaturas_ver', 'contratos_ver', 'renting_reservas', 'renting_contratos', 'motoristas_ver'])(
    'acesso a %s da a dashboard de frota',
    (recurso) => {
      expect(
        decidirDashboardTipo({ ...base, hasAccessToResource: (r) => r === recurso })
      ).toBe('frota');
    }
  );

  it('so financeiro_recibos da a dashboard financeira', () => {
    expect(
      decidirDashboardTipo({ ...base, hasAccessToResource: (r) => r === 'financeiro_recibos' })
    ).toBe('financeiro');
  });

  it('so assistencia_ver da a dashboard de assistencia', () => {
    expect(
      decidirDashboardTipo({ ...base, hasAccessToResource: (r) => r === 'assistencia_ver' })
    ).toBe('assistencia');
  });

  it('financeiro_recibos e viaturas_ver ao mesmo tempo da frota (prioridade)', () => {
    expect(
      decidirDashboardTipo({
        ...base,
        hasAccessToResource: (r) => r === 'financeiro_recibos' || r === 'viaturas_ver',
      })
    ).toBe('frota');
  });

  it('sem nenhum recurso cai no fallback de frota', () => {
    expect(decidirDashboardTipo(base)).toBe('frota');
  });
});
