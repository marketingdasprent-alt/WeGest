import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Dashboard from './Dashboard';

const mockTipo = { valor: 'frota' as 'frota' | 'financeiro' | 'assistencia' };
vi.mock('@/hooks/useDashboardTipo', () => ({
  useDashboardTipo: () => mockTipo.valor,
}));
vi.mock('@/components/dashboard/frota/DashboardFrota', () => ({
  DashboardFrota: () => <div>conteudo-frota</div>,
}));
vi.mock('@/components/dashboard/financeiro/DashboardFinanceiro', () => ({
  DashboardFinanceiro: () => <div>conteudo-financeiro</div>,
}));
vi.mock('@/components/dashboard/assistencia/DashboardAssistencia', () => ({
  DashboardAssistencia: () => <div>conteudo-assistencia</div>,
}));

describe('Dashboard router', () => {
  it('mostra a dashboard de frota por omissao', () => {
    mockTipo.valor = 'frota';
    render(<Dashboard />);
    expect(screen.getByText('conteudo-frota')).toBeInTheDocument();
  });

  it('mostra a dashboard financeira quando o tipo e financeiro', () => {
    mockTipo.valor = 'financeiro';
    render(<Dashboard />);
    expect(screen.getByText('conteudo-financeiro')).toBeInTheDocument();
  });

  it('mostra a dashboard de assistencia quando o tipo e assistencia', () => {
    mockTipo.valor = 'assistencia';
    render(<Dashboard />);
    expect(screen.getByText('conteudo-assistencia')).toBeInTheDocument();
  });
});
