import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
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

vi.mock('@/hooks/useFaturacaoMovimentos', () => ({
  useFaturacaoMovimentos: () => ({
    loading: false,
    hoje: { valor: 4210, count: 7 },
    semana: { valor: 18940, count: 31 },
    mes: { valor: 74512, count: 213 },
    serie: [
      { dia: '2026-09-01', label: '01/09', valor: 40000, contagem: 120 },
      { dia: '2026-09-02', label: '02/09', valor: 34512, contagem: 93 },
    ],
  }),
}));
vi.mock('@/hooks/useCartoesObeResumo', () => ({
  useCartoesObeResumo: () => ({
    loading: false,
    resumo: {
      cartoes: { total: 211, emUso: 149, disponiveis: 62, porTipo: { bp: 120, repsol: 60, edp: 31 } },
      obe: { total: 89, ativos: 84, semViatura: 5 },
    },
  }),
}));
vi.mock('@/hooks/useRecibosVerdesResumo', () => ({
  useRecibosVerdesResumo: () => ({
    loading: false,
    resumo: { validados: 189, pendentes: 14, recusados: 10, totais: 213 },
  }),
}));

beforeAll(() => {
  // O gráfico e o donut usam recharts, que mede o contentor à custa
  // de ResizeObserver — inexistente no jsdom.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

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

  it('mostra a faturação do mês e os recibos por estado', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Faturação')).toBeInTheDocument());
    expect(screen.getByText('Recibos por Estado')).toBeInTheDocument();
    // A legenda do gráfico e a do donut vêm de fontes diferentes; ambas contam.
    expect(screen.getByText('Facturas')).toBeInTheDocument();
    expect(screen.getByText('189')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('mostra os motoristas da semana', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Ruben Alexandre')).toBeInTheDocument());
  });

  it('mostra os cartões de frota e os dispositivos OBE', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Cartões Frota e OBE')).toBeInTheDocument());
    expect(screen.getByText('211')).toBeInTheDocument();
    expect(screen.getByText('89')).toBeInTheDocument();
    expect(screen.getByText(/84 ativos · 5 sem viatura associada/)).toBeInTheDocument();
  });

  it('junta cobranças, recibos e contratos em "Precisa de atenção"', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Precisa de atenção')).toBeInTheDocument());
    expect(screen.getByText(/Maria Silva/)).toBeInTheDocument();
    expect(screen.getByText(/2 por emitir/)).toBeInTheDocument();
    expect(screen.getByText(/Contrato #552/)).toBeInTheDocument();
  });
});
