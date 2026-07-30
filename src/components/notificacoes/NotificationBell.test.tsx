import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/NotificacoesContext', () => ({
  useNotificacoesContext: vi.fn(),
}));

// Separador "Todas" usa uma query à parte (histórico paginado) — mockada
// aqui como nos outros testes de páginas de notificações, para não
// precisar de um QueryClientProvider real (os testes desta suite nunca
// mudam para esse separador).
const mockUseNotificacoesHistorico = vi.fn(() => ({
  data: undefined,
  isLoading: false,
  error: null,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
}));
vi.mock('@/hooks/useNotificacoesHistorico', () => ({
  useNotificacoesHistorico: () => mockUseNotificacoesHistorico(),
}));

vi.mock('@/hooks/useNotifications', () => ({
  useMarkNotificationRead: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { NotificationBell } from './NotificationBell';
import { useNotificacoesContext } from '@/contexts/NotificacoesContext';

beforeAll(() => {
  // Popover (Radix) precisa de ResizeObserver no jsdom.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

/**
 * Preenche o contexto com defaults, para acrescentar um campo novo ao
 * NotificacoesContextValue não obrigar a editar todos os testes.
 */
function contexto(over: Partial<ReturnType<typeof useNotificacoesContext>>) {
  return {
    notificacoes: [],
    resolver: vi.fn(),
    enabled: true,
    totalNaoResolvidas: 0,
    erro: null,
    aCarregar: false,
    ...over,
  } as ReturnType<typeof useNotificacoesContext>;
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não renderiza nada para motorista (sino não faz sentido no portal)', () => {
    vi.mocked(useNotificacoesContext).mockReturnValue(contexto({ enabled: false }));

    const { container } = render(<NotificationBell />);
    expect(container.firstChild).toBeNull();
  });

  it('mostra o badge com a contagem de notificações activas', () => {
    vi.mocked(useNotificacoesContext).mockReturnValue(
      contexto({
        notificacoes: [
          {
            id: '1',
            titulo: 'Aviso 1',
            mensagem: null,
            severidade: 'normal',
            resolvida: false,
            created_at: new Date().toISOString(),
          },
          {
            id: '2',
            titulo: 'Aviso 2',
            mensagem: null,
            severidade: 'urgente',
            resolvida: false,
            created_at: new Date().toISOString(),
          },
        ] as never,
      })
    );

    render(<NotificationBell />);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('o badge conta TIPOS distintos, não linhas — descreve o que a lista mostra', () => {
    // O NotificationCenter agrupa por título. Cinco linhas de dois tipos
    // aparecem como dois grupos, por isso o badge tem de dizer 2 e não 5 —
    // senão o utilizador vê "5", abre, e conta dois.
    const linha = (id: string, titulo: string) => ({
      id,
      titulo,
      mensagem: null,
      severidade: 'normal',
      resolvida: false,
      created_at: new Date().toISOString(),
    });

    vi.mocked(useNotificacoesContext).mockReturnValue(
      contexto({
        notificacoes: [
          linha('1', 'Seguro de viatura a expirar'),
          linha('2', 'Seguro de viatura a expirar'),
          linha('3', 'Seguro de viatura a expirar'),
          linha('4', 'IUC a pagar'),
          linha('5', 'IUC a pagar'),
        ] as never,
      })
    );

    render(<NotificationBell />);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText('5')).toBeNull();
  });

  it('ao clicar no sino abre a lista persistente (NotificationCenter), não um toast que desaparece', () => {
    vi.mocked(useNotificacoesContext).mockReturnValue(
      contexto({
        notificacoes: [
          {
            id: '1',
            titulo: 'Viatura disponível',
            mensagem: 'A viatura X ficou livre',
            severidade: 'normal',
            resolvida: false,
            created_at: new Date().toISOString(),
          },
        ] as never,
      })
    );

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText('Notificações'));

    expect(screen.getByText('Viatura disponível')).toBeTruthy();
  });

  // ── Estado de erro e de carregamento ──────────────────────────────────────
  // O hook já distinguia "não foi possível ler" de "não tens avisos", mas o
  // sino passava sempre error={null} e isLoading={false} ao separador das não
  // resolvidas, pelo que a distinção nunca chegava ao ecrã: uma falha de
  // leitura aparecia como lista vazia.

  it('uma falha de leitura mostra erro, não "sem notificações"', () => {
    vi.mocked(useNotificacoesContext).mockReturnValue(
      contexto({ erro: new Error('Falha de rede'), notificacoes: [] })
    );

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText('Notificações'));

    expect(screen.getByText('Erro ao carregar notificações')).toBeTruthy();
    expect(screen.getByText('Falha de rede')).toBeTruthy();
  });

  it('enquanto carrega não afirma que a lista está vazia', () => {
    vi.mocked(useNotificacoesContext).mockReturnValue(
      contexto({ aCarregar: true, notificacoes: [] })
    );

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText('Notificações'));

    // O estado de carregamento do NotificationCenter são skeletons, e nenhum
    // deles é a mensagem de lista vazia.
    expect(screen.queryByText(/Sem notificações|Nenhuma notificação/i)).toBeNull();
    expect(screen.queryByText('Erro ao carregar notificações')).toBeNull();
  });

  it('avisa quando a lista está cortada pelo limite de leitura', () => {
    // useNotificacoes lê no máximo 200 linhas. Com mais do que isso, o
    // utilizador via só as primeiras e nada dizia que faltavam.
    vi.mocked(useNotificacoesContext).mockReturnValue(
      contexto({
        totalNaoResolvidas: 240,
        notificacoes: [
          {
            id: '1',
            titulo: 'Aviso',
            mensagem: null,
            severidade: 'normal',
            resolvida: false,
            created_at: new Date().toISOString(),
          },
        ] as never,
      })
    );

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText('Notificações'));

    expect(screen.getByText(/A mostrar 1 de 240/)).toBeTruthy();
  });

  it('não avisa de corte quando a lista está completa', () => {
    vi.mocked(useNotificacoesContext).mockReturnValue(
      contexto({
        totalNaoResolvidas: 1,
        notificacoes: [
          {
            id: '1',
            titulo: 'Aviso',
            mensagem: null,
            severidade: 'normal',
            resolvida: false,
            created_at: new Date().toISOString(),
          },
        ] as never,
      })
    );

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText('Notificações'));

    expect(screen.queryByText(/A mostrar/)).toBeNull();
  });
});
