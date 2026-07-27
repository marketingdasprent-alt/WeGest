import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'gestor@wegest.pt', user_metadata: {} } }),
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ orgId: null, orgNome: null, orgs: [], switchOrg: vi.fn(), loading: false }),
}));

vi.mock('@/hooks/useThemedLogo', () => ({
  useThemedLogo: () => '/logo.png',
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => null,
}));

// Sino já tem testes próprios — aqui só interessa que é montado no sidebar.
vi.mock('@/components/notificacoes/NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell-stub" />,
}));

import { SidebarMenu } from './SidebarMenu';
import { usePermissions } from '@/hooks/usePermissions';

beforeAll(() => {
  // cmdk (CommandMenu) precisa de ResizeObserver + scrollIntoView no jsdom.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function mockPermissions(hasAccessToResource: (recurso: string) => boolean) {
  vi.mocked(usePermissions).mockReturnValue({
    isAdmin: false,
    cargo: null,
    cargo_id: null,
    tipoUtilizador: 'colaborador' as const,
    hasRole: vi.fn(() => false),
    hasPermission: vi.fn(() => false),
    canEdit: vi.fn(() => false),
    hasAccessToResource: vi.fn(hasAccessToResource),
    podeVerTodosRenting: false,
    loading: false,
    roles: [],
    recursos: [],
    recursosEditaveis: [],
  } as never);
}

describe('SidebarMenu — sino e pesquisa global (desktop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('monta o sino de notificações no rodapé do sidebar (não é só um toast)', () => {
    mockPermissions(() => true);
    renderWithProviders(<SidebarMenu />);
    expect(screen.getByTestId('notification-bell-stub')).toBeTruthy();
  });

  it('Cmd+K abre a pesquisa global e lista só os itens (incl. sub-itens) a que o utilizador tem acesso', () => {
    // Só acesso a viaturas_ver (Frota) — Renting/Administrativo/etc ficam de fora.
    mockPermissions((recurso) => recurso === 'viaturas_ver');
    renderWithProviders(<SidebarMenu />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    expect(screen.getByPlaceholderText('Pesquisar ou saltar para...')).toBeTruthy();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Viaturas')).toBeTruthy();
    expect(dialog.queryByText('Contratos')).toBeNull();
  });

  it('botão de pesquisa no rodapé também abre o CommandMenu', () => {
    mockPermissions(() => true);
    renderWithProviders(<SidebarMenu />);

    fireEvent.click(screen.getByLabelText('Pesquisar (Cmd+K)'));
    expect(screen.getByPlaceholderText('Pesquisar ou saltar para...')).toBeTruthy();
  });
});
