import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: vi.fn(),
}));

vi.mock('@/hooks/useNotificacoes', () => ({
  useNotificacoes: vi.fn(),
}));

import { NotificationBell } from './NotificationBell';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotificacoes } from '@/hooks/useNotificacoes';

beforeAll(() => {
  // Popover (Radix) precisa de ResizeObserver no jsdom.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function mockPermissions(tipoUtilizador: 'colaborador' | 'motorista') {
  vi.mocked(usePermissions).mockReturnValue({
    isAdmin: false,
    cargo: null,
    cargo_id: null,
    tipoUtilizador,
    hasRole: vi.fn(() => false),
    hasPermission: vi.fn(() => false),
    canEdit: vi.fn(() => false),
    hasAccessToResource: vi.fn(() => false),
    podeVerTodosRenting: false,
    loading: false,
    roles: [],
    recursos: [],
    recursosEditaveis: [],
  } as never);
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não renderiza nada para motorista (sino não faz sentido no portal)', () => {
    mockPermissions('motorista');
    vi.mocked(useNotificacoes).mockReturnValue({ notificacoes: [], resolver: vi.fn() });

    const { container } = render(<NotificationBell />);
    expect(container.firstChild).toBeNull();
  });

  it('mostra o badge com a contagem de notificações activas', () => {
    mockPermissions('colaborador');
    vi.mocked(useNotificacoes).mockReturnValue({
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
    });

    render(<NotificationBell />);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('ao clicar no sino abre a lista persistente (NotificationCenter), não um toast que desaparece', () => {
    mockPermissions('colaborador');
    vi.mocked(useNotificacoes).mockReturnValue({
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
