import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const estado = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  isAdmin: false,
  cargos: [] as string[],
  loading: false,
  data: { total: 3, porTipo: { kms: 2, preco_semana: 1 } } as
    | {
        total: number;
        porTipo: Record<string, number>;
      }
    | undefined,
  enabled: undefined as boolean | undefined,
  navigate: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: estado.user }) }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isAdmin: estado.isAdmin,
    cargos: estado.cargos,
    loading: estado.loading,
  }),
}));
vi.mock('@/hooks/usePedidosTrocaKms', () => ({
  usePedidosPendentesCount: (enabled: boolean) => {
    estado.enabled = enabled;
    return { data: enabled ? estado.data : undefined };
  },
}));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => estado.navigate,
}));

import { AvisoPedidosPendentes } from './AvisoPedidosPendentes';

const montar = (rota = '/dashboard') =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <AvisoPedidosPendentes />
    </MemoryRouter>
  );

describe('AvisoPedidosPendentes', () => {
  beforeEach(() => {
    sessionStorage.clear();
    estado.user = { id: 'u1' };
    estado.isAdmin = true;
    estado.cargos = [];
    estado.loading = false;
    estado.data = { total: 3, porTipo: { kms: 2, preco_semana: 1 } };
    estado.navigate.mockReset();
  });

  it('mostra a contagem e o detalhe por tipo ao admin', () => {
    montar();
    expect(screen.getByText('3 pedidos por responder')).toBeTruthy();
    expect(screen.getByText('2 Kms · 1 Valor semanal')).toBeTruthy();
  });

  it('mostra ao Supervisor Gestor TVDE', () => {
    estado.isAdmin = false;
    estado.cargos = ['Supervisor Gestor TVDE'];
    montar();
    expect(screen.getByText('3 pedidos por responder')).toBeTruthy();
  });

  it('não mostra nem consulta para quem não aprova', () => {
    estado.isAdmin = false;
    estado.cargos = ['Gestor TVDE'];
    montar();
    expect(estado.enabled).toBe(false);
    expect(screen.queryByText('3 pedidos por responder')).toBeNull();
  });

  it('não mostra sem pendentes', () => {
    estado.data = { total: 0, porTipo: {} };
    montar();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('só aparece uma vez por sessão', () => {
    const { unmount } = montar();
    unmount();
    montar();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('não aparece na página dos pedidos e não gasta o aviso da sessão', () => {
    const { unmount } = montar('/renting/pedidos-kms');
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    montar('/dashboard');
    expect(screen.getByText('3 pedidos por responder')).toBeTruthy();
  });

  it('"Ver pedidos" navega e "Fechar" fecha', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Ver pedidos' }));
    expect(estado.navigate).toHaveBeenCalledWith('/renting/pedidos-kms');
  });

  it('usa o singular com um pedido', () => {
    estado.data = { total: 1, porTipo: { tarifa: 1 } };
    montar();
    expect(screen.getByText('1 pedido por responder')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[0]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
