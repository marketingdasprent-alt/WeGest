import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DashboardFinanceiro } from './DashboardFinanceiro';

vi.mock('@/hooks/useResumoPlataformas', () => ({
  useResumoPlataformas: () => ({
    loading: false,
    dados: [
      { plataforma: 'Bolt', tipo_valor: 'receita', valor: 8390, valor_bruto: 10240, comissao: 1850 },
      { plataforma: 'Uber', tipo_valor: 'receita', valor: 7490, valor_bruto: 8960, comissao: 1470 },
      { plataforma: 'BP', tipo_valor: 'custo', valor: 1640.2, valor_bruto: null, comissao: null },
    ],
  }),
}));
vi.mock('@/hooks/useFaturacaoResumoPeriodo', () => ({
  useFaturacaoResumoPeriodo: () => ({
    loading: false,
    resumo: {
      pendentes: { count: 2, valor: 500 },
      emitidas: { count: 5, valor: 3000 },
      emAtraso: { count: 1, valor: 200 },
    },
  }),
}));

describe('DashboardFinanceiro', () => {
  it('mostra o cabeçalho com o rótulo do perfil', async () => {
    render(<DashboardFinanceiro />);
    await waitFor(() => expect(screen.getByText('Financeiro')).toBeInTheDocument());
  });

  it('mostra os KPIs do topo', async () => {
    render(<DashboardFinanceiro />);
    await waitFor(() => expect(screen.getByText('Faturado hoje')).toBeInTheDocument());
    expect(screen.getByText('Esta semana')).toBeInTheDocument();
    expect(screen.getByText('Recibos pendentes')).toBeInTheDocument();
    expect(screen.getByText('Líquido este mês')).toBeInTheDocument();
  });

  it('mostra as plataformas da semana', async () => {
    render(<DashboardFinanceiro />);
    await waitFor(() => expect(screen.getByAltText('Bolt')).toBeInTheDocument());
    expect(screen.getByAltText('Uber')).toBeInTheDocument();
    expect(screen.getByAltText('BP')).toBeInTheDocument();
  });
});
