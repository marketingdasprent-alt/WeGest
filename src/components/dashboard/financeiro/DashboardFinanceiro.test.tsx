import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { DashboardFinanceiro } from './DashboardFinanceiro';

const navegou = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navegou,
}));

// O cabeçalho partilhado é testado a sério em DashboardFrota.test.tsx (com
// QueryClientProvider); aqui só interessa que recebe o perfil certo.
vi.mock('@/components/dashboard/DashboardInicioHeader', () => ({
  DashboardInicioHeader: ({ perfil }: { perfil?: string }) => <div>perfil:{perfil}</div>,
}));

vi.mock('@/hooks/useResumoPlataformas', () => ({
  useResumoPlataformas: () => ({
    loading: false,
    dados: [
      {
        plataforma: 'Bolt',
        tipo_valor: 'receita',
        valor: 8390,
        valor_bruto: 10240,
        comissao: 1850,
      },
      { plataforma: 'Uber', tipo_valor: 'receita', valor: 7490, valor_bruto: 8960, comissao: 1470 },
      { plataforma: 'BP', tipo_valor: 'custo', valor: 1640.2, valor_bruto: null, comissao: null },
    ],
  }),
}));
vi.mock('@/hooks/useFaturacaoPendentes', () => ({
  useFaturacaoPendentes: () => ({ loading: false, pendentes: { count: 2, valor: 500 } }),
}));
vi.mock('@/hooks/useContasAReceber', () => ({
  DIAS_EM_ABERTO_ALERTA: 30,
  useContasAReceber: () => ({
    data: {
      totalAReceber: 1875,
      emAberto: [
        {
          id: 'c1',
          destinatarioNome: 'Maria Silva',
          contratoId: 'ct1',
          saldo: 1375,
          diasEmAberto: 56,
        },
        {
          id: 'c2',
          destinatarioNome: 'Joao Costa',
          contratoId: 'ct2',
          saldo: 500,
          diasEmAberto: 12,
        },
      ],
    },
  }),
}));
vi.mock('@/hooks/useContratosARenovar', () => ({
  useContratosARenovar: () => ({
    loading: false,
    contratos: [
      {
        id: 'ct1',
        numero_contrato: 552,
        motorista_nome: 'Maria',
        matricula: 'AA-11-BB',
        diasParaRenovar: 12,
      },
    ],
  }),
}));
vi.mock('@/hooks/useUltimaSemanaFechada', () => ({
  useUltimaSemanaFechada: () => ({
    loading: false,
    semana: { inicio: new Date('2026-08-31T00:00:00'), fim: new Date('2026-09-06T00:00:00') },
  }),
}));
vi.mock('@/hooks/useContasResumoSemana', () => ({
  useContasResumoSemana: () => ({
    loading: false,
    resumos: [
      {
        _uid: 'm1',
        driver_uuid: 'd1',
        driver_name: 'Ruben Alexandre',
        total_faturado: 680,
        aluguer: 225,
        combustivel: 40,
        portagens: 10,
        reparacoes: 0,
        liquido: 405,
      },
    ],
  }),
}));
vi.mock('@/hooks/useFaturacaoMovimentos', () => ({
  useFaturacaoMovimentos: () => ({
    loading: false,
    hoje: { valor: 4210, count: 7 },
    semana: { valor: 18940, count: 31 },
    periodo: { valor: 74512, count: 213 },
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
      cartoes: {
        total: 211,
        emUso: 149,
        disponiveis: 62,
        porTipo: { bp: 120, repsol: 60, edp: 31 },
      },
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

beforeEach(() => navegou.mockClear());

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

  it('mostra as contas de motoristas da ultima semana fechada', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Ruben Alexandre')).toBeInTheDocument());
    // O cartão não rola: a lista está cortada e o rodapé leva ao separador
    // onde ela está inteira.
    expect(screen.getByRole('button', { name: /Ver em Administrativo/ })).toBeInTheDocument();
  });

  it('abre a conta do motorista no separador Resumos', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Ruben Alexandre')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Ruben Alexandre'));

    // O uuid é o que o separador Resumos usa para encontrar o motorista e
    // abrir-lhe o diálogo — sem ele o clique não leva a lado nenhum.
    expect(navegou).toHaveBeenCalledWith('/administrativo?motorista=d1');
  });

  it('deixa escolher o período do gráfico de faturação', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Faturação')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Este Mês/ }));

    expect(screen.getByRole('button', { name: 'Esta Semana' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trimestre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Este Ano' })).toBeInTheDocument();
    expect(screen.getByText('Intervalo personalizado')).toBeInTheDocument();
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
