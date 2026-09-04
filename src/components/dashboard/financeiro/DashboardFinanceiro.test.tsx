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
vi.mock('@/hooks/useContratosARenovar', () => ({
  useContratosARenovar: () => ({ loading: false, contratos: [] }),
}));
vi.mock('@/hooks/useContasAReceber', () => ({
  useContasAReceber: () => ({
    data: {
      totalAReceber: 500,
      emAberto: [
        { id: 'cobranca-1', destinatarioNome: 'Maria Silva', contratoId: 'contrato-1', saldo: 500, diasEmAberto: 45 },
      ],
    },
  }),
}));

describe('DashboardFinanceiro', () => {
  it('mostra as plataformas do resumo', async () => {
    render(<DashboardFinanceiro />);
    await waitFor(() => expect(screen.getByText('Bolt')).toBeInTheDocument());
    expect(screen.getByText('Uber')).toBeInTheDocument();
    expect(screen.getByText('BP')).toBeInTheDocument();
  });

  it('mostra as cobranças em aberto', async () => {
    render(<DashboardFinanceiro />);
    await waitFor(() => expect(screen.getByText('Maria Silva')).toBeInTheDocument());
  });
});
