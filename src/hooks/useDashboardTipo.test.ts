import { describe, it, expect } from 'vitest';
import { decidirDashboardTipo } from './useDashboardTipo';

const base = {
  isAdmin: false,
  cargo: null,
  hasAccessToResource: (_recurso: string) => false,
};

describe('decidirDashboardTipo', () => {
  it('admin ve sempre a dashboard de frota', () => {
    expect(decidirDashboardTipo({ ...base, isAdmin: true })).toBe('frota');
  });

  it('grupo Financeiro/Faturação vê a dashboard financeira', () => {
    expect(decidirDashboardTipo({ ...base, cargo: 'Financeiro / Faturação' })).toBe('financeiro');
  });

  it('reconhece faturação com acento e sem distinção de maiúsculas', () => {
    expect(decidirDashboardTipo({ ...base, cargo: 'fAtUrAçÃo' })).toBe('financeiro');
  });

  it('grupo Assistência vê a dashboard de assistência', () => {
    expect(decidirDashboardTipo({ ...base, cargo: 'Gestão de Assistência' })).toBe('assistencia');
  });

  it('grupos não reconhecidos ficam na dashboard de frota', () => {
    expect(decidirDashboardTipo({ ...base, cargo: 'Operacional' })).toBe('frota');
  });

  it('sem grupo cai no fallback de frota', () => {
    expect(decidirDashboardTipo(base)).toBe('frota');
  });
});
