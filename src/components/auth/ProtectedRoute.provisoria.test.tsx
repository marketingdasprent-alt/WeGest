import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

const senha = vi.hoisted(() => ({
  value: { data: null, isLoading: false } as { data: unknown; isLoading: boolean },
}));
const opcoesSenha = vi.hoisted(() => ({ ultimas: undefined as unknown }));

vi.mock('@/hooks/useSenhaProvisoria', () => ({
  useSenhaProvisoria: (o: unknown) => {
    opcoesSenha.ultimas = o;
    return senha.value;
  },
}));
vi.mock('@/hooks/useEhMotorista', () => ({
  useEhMotorista: () => ({ isLoading: false, data: undefined }),
}));
vi.mock('@/lib/pwa', () => ({
  estaInstaladoComoApp: () => false,
  deveBloquearNoPwa: () => false,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false, signOut: vi.fn() }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ orgId: 'o1', orgs: [{ id: 'o1' }], orgsCarregadas: true, loading: false }),
}));
vi.mock('@/hooks/useModules', () => ({
  useModules: () => ({ has: () => true, isLoading: false }),
}));
vi.mock('@/lib/contaCliente', () => ({
  ehContaDeClienteDoSite: () => false,
  ehContaSemOrganizacao: () => false,
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isAdmin: false,
    hasAccessToResource: () => true,
    loading: false,
    cargo_id: null,
    cargos: [],
    recursos: [],
    tipoUtilizador: 'motorista',
  }),
}));

function Sonda() {
  const { pathname, search } = useLocation();
  return <output data-testid="url">{pathname + search}</output>;
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/motorista/painel']}>
      <Routes>
        <Route
          path="/motorista/painel"
          element={
            <ProtectedRoute>
              <p>Painel</p>
            </ProtectedRoute>
          }
        />
        <Route path="/reset-password" element={<p>Escolher senha</p>} />
      </Routes>
      <Sonda />
    </MemoryRouter>
  );
}

beforeEach(() => {
  senha.value = { data: null, isLoading: false };
});

describe('ProtectedRoute com senha provisória', () => {
  it('motorista com por_trocar vai para /reset-password?provisoria=1', () => {
    senha.value = { data: { por_trocar: true, expira_em: null }, isLoading: false };
    montar();
    expect(screen.getByTestId('url').textContent).toBe('/reset-password?provisoria=1');
    expect(screen.queryByText('Painel')).toBeNull();
  });

  it('sem senha por trocar entra no painel', () => {
    senha.value = { data: { por_trocar: false, expira_em: null }, isLoading: false };
    montar();
    expect(screen.getByText('Painel')).toBeTruthy();
  });

  it('sem linha (nenhuma provisória) entra no painel', () => {
    montar();
    expect(screen.getByText('Painel')).toBeTruthy();
  });

  it('a verificação só corre para motoristas com sessão', () => {
    montar();
    expect(opcoesSenha.ultimas).toEqual({ enabled: true });
  });
});
