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
});
