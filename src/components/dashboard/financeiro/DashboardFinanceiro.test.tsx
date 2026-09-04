import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { DashboardFinanceiro } from './DashboardFinanceiro';

// O cabeçalho partilhado é testado a sério em DashboardFrota.test.tsx (com
// QueryClientProvider); aqui só interessa que recebe o perfil certo.
vi.mock('@/components/dashboard/DashboardInicioHeader', () => ({
  DashboardInicioHeader: ({ perfil }: { perfil?: string }) => <div>perfil:{perfil}</div>,
}));

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
vi.mock('@/hooks/useContasAReceber', () => ({
  useContasAReceber: () => ({
    data: {
      totalAReceber: 1875,
      emAberto: [
        { id: 'c1', destinatarioNome: 'Maria Silva', contratoId: 'ct1', saldo: 1375, diasEmAberto: 56 },
        { id: 'c2', destinatarioNome: 'Joao Costa', contratoId: 'ct2', saldo: 500, diasEmAberto: 12 },
      ],
    },
  }),
}));
vi.mock('@/hooks/useContratosARenovar', () => ({
  useContratosARenovar: () => ({
    loading: false,
    contratos: [
      { id: 'ct1', numero_contrato: 552, motorista_nome: 'Maria', matricula: 'AA-11-BB', diasParaRenovar: 12 },
    ],
  }),
}));
vi.mock('@/hooks/useTopMotoristasSemana', () => ({
  useTopMotoristasSemana: () => ({
    loading: false,
    periodo: { inicio: new Date('2026-08-31'), fim: new Date('2026-09-06') },
    motoristas: [{ motoristaId: 'm1', nome: 'Ruben Alexandre', faturado: 680, liquido: 455 }],
  }),
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardFinanceiro />
    </MemoryRouter>
  );
}

describe('DashboardFinanceiro', () => {
  it('identifica-se ao cabeçalho como o perfil Financeiro', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText(/perfil:Financeiro/)).toBeInTheDocument());
  });

  it('mostra a faixa de KPIs', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Faturado hoje')).toBeInTheDocument());
    expect(screen.getByText('Esta semana')).toBeInTheDocument();
    expect(screen.getByText('Por emitir')).toBeInTheDocument();
    expect(screen.getByText('Em atraso')).toBeInTheDocument();
    expect(screen.getByText('Líquido este mês')).toBeInTheDocument();
  });

  it('mostra as plataformas com bruto e comissão', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Bolt')).toBeInTheDocument());
    expect(screen.getByText('Uber')).toBeInTheDocument();
    // Bolt e Uber trazem ambos a linha de brutos/comissão; os custos não.
    expect(screen.getAllByText(/brutos/)).toHaveLength(2);
  });

  it('mostra os motoristas da semana', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Ruben Alexandre')).toBeInTheDocument());
  });

  it('junta cobranças, recibos e contratos em "Precisa de atenção"', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Precisa de atenção')).toBeInTheDocument());
    expect(screen.getByText(/Maria Silva/)).toBeInTheDocument();
    expect(screen.getByText(/2 por emitir/)).toBeInTheDocument();
    expect(screen.getByText(/Contrato #552/)).toBeInTheDocument();
  });
});
