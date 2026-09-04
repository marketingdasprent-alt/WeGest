import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { DashboardAssistencia } from './DashboardAssistencia';

const navegou = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navegou,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasAccessToResource: () => true }),
}));

// O cabeçalho partilhado é testado a sério em DashboardFrota.test.tsx (com
// QueryClientProvider); aqui só interessa que recebe o perfil certo.
vi.mock('@/components/dashboard/DashboardInicioHeader', () => ({
  DashboardInicioHeader: ({ perfil }: { perfil?: string }) => <div>perfil:{perfil}</div>,
}));

vi.mock('@/hooks/useAssistenciaInicioResumo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useAssistenciaInicioResumo')>()),
  useAssistenciaInicioResumo: () => ({
    loading: false,
    kpis: {
      porResolver: 8,
      naoAtribuidos: 3,
      atribuidosAMim: 2,
      resolvidosHoje: 1,
      prazoUltrapassado: 2,
    },
    categorias: [
      { id: 'c1', nome: 'Mecanotécnico', cor: '#3B82F6', icone: 'wrench', contagem: 3 },
      { id: 'c2', nome: 'Chapa e pintura', cor: '#F59E0B', icone: 'paint-bucket', contagem: 2 },
      // Sem tickets abertos — não deve ocupar espaço no cartão.
      { id: 'c3', nome: 'Teste Categoria', cor: '#10B981', icone: 'wrench', contagem: 0 },
    ],
    prioridades: [
      { prioridade: 'urgente', contagem: 1 },
      { prioridade: 'alta', contagem: 2 },
      { prioridade: 'media', contagem: 4 },
      { prioridade: 'baixa', contagem: 1 },
    ],
    semPrioridade: 0,
    porAtribuir: [
      {
        id: 't1',
        numero: 41,
        titulo: 'Fuga de óleo',
        prioridade: 'alta',
        atribuido: false,
        criadoEm: '2026-08-20T10:00:00Z',
        dataEstimada: null,
        diasAberto: 15,
      },
    ],
    atrasados: [
      {
        id: 't2',
        numero: 37,
        titulo: 'Travões a chiar',
        prioridade: 'urgente',
        atribuido: true,
        criadoEm: '2026-08-10T10:00:00Z',
        dataEstimada: '2026-08-30',
        diasAberto: 25,
      },
    ],
    movimentos: [
      { dia: '2026-09-01', abertos: 3, resolvidos: 1 },
      { dia: '2026-09-02', abertos: 2, resolvidos: 4 },
    ],
  }),
}));

vi.mock('@/hooks/useViaturasNaOficina', () => ({
  useViaturasNaOficina: () => ({
    data: [
      {
        id: 'r1',
        viatura_id: 'v1',
        matricula: 'AA-11-BB',
        marca: 'Renault',
        modelo: 'Clio',
        descricao: null,
        oficina: 'Oficina Central',
        data_entrada: '2026-09-01',
        km_entrada: 120000,
      },
    ],
  }),
}));

beforeAll(() => {
  // O gráfico usa recharts, que mede o contentor à custa de ResizeObserver —
  // inexistente no jsdom.
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
      <DashboardAssistencia />
    </MemoryRouter>
  );
}

describe('DashboardAssistencia', () => {
  it('identifica-se ao cabeçalho como o perfil Assistência', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText(/perfil:Assistência/)).toBeInTheDocument());
  });

  it('mostra a faixa de KPIs', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Por resolver')).toBeInTheDocument());
    expect(screen.getByText('Não atribuídos')).toBeInTheDocument();
    expect(screen.getByText('Atribuídos a mim')).toBeInTheDocument();
    expect(screen.getByText('Fora do prazo')).toBeInTheDocument();
    expect(screen.getByText('Resolvidos hoje')).toBeInTheDocument();
  });

  it('mostra só as categorias com tickets abertos', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Mecanotécnico')).toBeInTheDocument());
    expect(screen.getByText('Chapa e pintura')).toBeInTheDocument();
    // Dez categorias a zero pesavam tanto no ecrã como as que davam trabalho.
    expect(screen.queryByText('Teste Categoria')).not.toBeInTheDocument();
  });

  it('fecha a conta das categorias com os tickets sem categoria', async () => {
    renderDashboard();
    // 8 por resolver, 3 + 2 categorizados: os outros 3 não desaparecem do
    // cartão só por não terem categoria.
    await waitFor(() => expect(screen.getByText('Sem categoria')).toBeInTheDocument());
  });

  it('abre o ticket em causa a partir de "Precisa de atenção"', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText(/#37 — Travões a chiar/)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/#37 — Travões a chiar/));

    expect(navegou).toHaveBeenCalledWith('/assistencia/t2');
  });

  it('junta prazos, tickets por atribuir e urgentes em "Precisa de atenção"', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Precisa de atenção')).toBeInTheDocument());
    expect(screen.getByText(/#37 — Travões a chiar/)).toBeInTheDocument();
    expect(screen.getByText(/#41 — aberto há 15 dias/)).toBeInTheDocument();
    expect(screen.getByText(/1 ticket com prioridade urgente/)).toBeInTheDocument();
  });

  it('mostra a distribuição por prioridade', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Por prioridade')).toBeInTheDocument());
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('Baixa')).toBeInTheDocument();
  });

  it('lista as viaturas na oficina e abre a ficha da viatura', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Na oficina')).toBeInTheDocument());

    fireEvent.click(screen.getByText('AA-11-BB'));

    expect(navegou).toHaveBeenCalledWith('/viaturas/v1');
  });

  it('deixa escolher o período do gráfico de tickets', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Tickets')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Este Mês/ }));

    expect(screen.getByRole('button', { name: 'Esta Semana' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Este Ano' })).toBeInTheDocument();
  });
});
