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
vi.mock('@/hooks/useAluguerResumoPeriodo', () => ({
  useAluguerResumoPeriodo: () => ({ loading: false, valor: 8750 }),
}));
vi.mock('@/hooks/useTopMotoristasSemana', () => ({
  useTopMotoristasSemana: () => ({
    loading: false,
    periodo: { inicio: new Date('2026-08-26'), fim: new Date('2026-09-01') },
    motoristas: [
      { motoristaId: 'm1', nome: 'Ruben Alexandre', faturado: 680, liquido: 455 },
      { motoristaId: 'm2', nome: 'Muhammad Tarar', faturado: 710.5, liquido: 485.5 },
    ],
  }),
}));
vi.mock('@/hooks/useRecibosVerdesResumo', () => ({
  useRecibosVerdesResumo: () => ({
    loading: false,
    resumo: { pendentes: 12, validados: 68, recusados: 6, totais: 86 },
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

  it('mostra o resumo semanal de top motoristas', async () => {
    render(<DashboardFinanceiro />);
    await waitFor(() => expect(screen.getByText('Ruben Alexandre')).toBeInTheDocument());
    expect(screen.getByText('Muhammad Tarar')).toBeInTheDocument();
  });

  it('mostra os totais de recibos verdes', async () => {
    render(<DashboardFinanceiro />);
    await waitFor(() => expect(screen.getByText('Recibos Verdes')).toBeInTheDocument());
    expect(screen.getByText('86')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('mostra o alerta de recibos a validar em Precisa de Atenção', async () => {
    render(<DashboardFinanceiro />);
    await waitFor(() => expect(screen.getByText(/a aguardar/)).toBeInTheDocument());
  });
});
