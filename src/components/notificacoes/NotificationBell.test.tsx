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

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não renderiza nada para motorista (sino não faz sentido no portal)', () => {
    vi.mocked(useNotificacoesContext).mockReturnValue({
      notificacoes: [],
      resolver: vi.fn(),
      enabled: false,
    });

    const { container } = render(<NotificationBell />);
    expect(container.firstChild).toBeNull();
  });

  it('mostra o badge com a contagem de notificações activas', () => {
    vi.mocked(useNotificacoesContext).mockReturnValue({
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
      resolver: vi.fn(),
      enabled: true,
    });

    render(<NotificationBell />);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('ao clicar no sino abre a lista persistente (NotificationCenter), não um toast que desaparece', () => {
    vi.mocked(useNotificacoesContext).mockReturnValue({
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
      resolver: vi.fn(),
      enabled: true,
    });

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText('Notificações'));

    expect(screen.getByText('Viatura disponível')).toBeTruthy();
  });
});
