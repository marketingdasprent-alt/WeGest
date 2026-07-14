import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import NotificacoesPage from './NotificacoesPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockInfiniteQuery = vi.fn();
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useInfiniteQuery: (...args: unknown[]) => mockInfiniteQuery(...args),
  };
});

const mockMutate = vi.fn();
vi.mock('@/hooks/useNotifications', () => ({
  useMarkNotificationRead: () => ({ mutate: mockMutate, isPending: false }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeNotificacao = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'n1',
  org_id: null,
  tipo: 'motorista_pendente',
  candidatura_id: null,
  link: null,
  destinatario_id: null,
  destinatario_user_id: null,
  evento_id: null,
  viatura_id: null,
  titulo: 'Nova candidatura',
  mensagem: 'João Silva submeteu a candidatura.',
  severidade: 'normal',
  resolvida: false,
  resolvida_por: null,
  resolvida_por_nome: null,
  resolvida_em: null,
  created_at: new Date(Date.now() - 60_000).toISOString(),
  ...overrides,
});

function setInfiniteQueryResult(
  overrides: Partial<{
    data: unknown;
    isLoading: boolean;
    error: Error | null;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
  }>
) {
  mockInfiniteQuery.mockReturnValue({
    data: { pages: [{ data: [], total: 0, totalPages: 0, page: 1 }] },
    isLoading: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NotificacoesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInfiniteQueryResult({});
  });

  it('renderiza o título da página', () => {
    setInfiniteQueryResult({
      data: { pages: [{ data: [], total: 0, totalPages: 0, page: 1 }] },
    });
    render(<NotificacoesPage />);
    expect(screen.getByText('Notificações')).toBeTruthy();
  });

  it('mostra estado de loading', () => {
    mockInfiniteQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    const { container } = render(<NotificacoesPage />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('mostra empty state quando não há notificações', () => {
    setInfiniteQueryResult({
      data: { pages: [{ data: [], total: 0, totalPages: 0, page: 1 }] },
    });
    render(<NotificacoesPage />);
    expect(screen.getByText('Sem notificações')).toBeTruthy();
  });

  it('renderiza lista de notificações', () => {
    const notifs = [
      makeNotificacao({ id: 'n1', titulo: 'Candidatura pendente' }),
      makeNotificacao({ id: 'n2', titulo: 'Escalonamento urgente', severidade: 'urgente' }),
    ];
    setInfiniteQueryResult({
      data: { pages: [{ data: notifs, total: 2, totalPages: 1, page: 1 }] },
    });
    render(<NotificacoesPage />);
    expect(screen.getByText('Candidatura pendente')).toBeTruthy();
    expect(screen.getByText(/Escalonamento urgente/)).toBeTruthy();
  });

  it('chama mutate ao clicar em Resolver', () => {
    const notifs = [makeNotificacao({ id: 'n1', titulo: 'Candidatura pendente' })];
    setInfiniteQueryResult({
      data: { pages: [{ data: notifs, total: 1, totalPages: 1, page: 1 }] },
    });
    render(<NotificacoesPage />);
    const resolverBtn = screen.getByText('Resolver');
    fireEvent.click(resolverBtn);
    expect(mockMutate).toHaveBeenCalledWith('n1');
  });

  it('navega ao clicar no botão Ver', () => {
    const notifs = [
      makeNotificacao({ id: 'n1', titulo: 'Candidatura pendente', tipo: 'motorista_pendente' }),
    ];
    setInfiniteQueryResult({
      data: { pages: [{ data: notifs, total: 1, totalPages: 1, page: 1 }] },
    });
    render(<NotificacoesPage />);
    const verBtn = screen.getByText('Ver candidatura');
    fireEvent.click(verBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/motoristas/candidaturas');
  });

  it('mostra botão Carregar mais quando há mais páginas', () => {
    const notifs = [makeNotificacao({ id: 'n1', titulo: 'Candidatura pendente' })];
    const fetchNextPage = vi.fn();
    setInfiniteQueryResult({
      data: { pages: [{ data: notifs, total: 30, totalPages: 2, page: 1 }] },
      hasNextPage: true,
      fetchNextPage,
    });
    render(<NotificacoesPage />);
    const loadMoreBtn = screen.getByText('Carregar mais');
    fireEvent.click(loadMoreBtn);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('mostra estado de erro', () => {
    mockInfiniteQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Falha na ligação'),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    render(<NotificacoesPage />);
    expect(screen.getByText('Erro ao carregar notificações')).toBeTruthy();
    expect(screen.getByText('Falha na ligação')).toBeTruthy();
  });

  it('alterna filtro para Todas', () => {
    const notifs = [makeNotificacao({ id: 'n1', titulo: 'Candidatura pendente' })];
    setInfiniteQueryResult({
      data: { pages: [{ data: notifs, total: 1, totalPages: 1, page: 1 }] },
    });
    render(<NotificacoesPage />);
    expect(screen.getByText('Não resolvidas')).toBeTruthy();
    fireEvent.click(screen.getByText('Todas'));
    const lastCall = mockInfiniteQuery.mock.calls.at(-1);
    expect(lastCall).toBeTruthy();
  });
});
