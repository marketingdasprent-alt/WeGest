import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const m = vi.hoisted(() => ({
  orgId: null as string | null,
  defaultRoute: '/dashboard' as string | null,
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    orgId: m.orgId,
    orgs: [
      { id: 'org-decada', nome: 'Década Ousada', codigo: 'decada', logo_url: null, ativa: true },
      { id: 'org-premium', nome: 'PREMIUM RIDE', codigo: 'premium', logo_url: null, ativa: true },
    ],
    switchOrg: vi.fn(),
  }),
}));
vi.mock('@/hooks/useDefaultRoute', () => ({
  useDefaultRoute: () => ({ defaultRoute: m.defaultRoute, loading: false }),
}));

import SelecionarOrg from './SelecionarOrg';

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/selecionar-org']}>
      <Routes>
        <Route path="/selecionar-org" element={<SelecionarOrg />} />
        <Route path="/dashboard" element={<p>painel</p>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  m.orgId = null;
  m.defaultRoute = '/dashboard';
});

describe('SelecionarOrg', () => {
  it('sem empresa escolhida mostra as empresas', () => {
    montar();
    expect(screen.getByText('Década Ousada')).toBeInTheDocument();
    expect(screen.getByText('PREMIUM RIDE')).toBeInTheDocument();
  });

  it('com a empresa já escolhida sai para a página inicial (o reload do switchOrg não fica preso aqui)', () => {
    m.orgId = 'org-decada';
    montar();
    expect(screen.getByText('painel')).toBeInTheDocument();
    expect(screen.queryByText('PREMIUM RIDE')).not.toBeInTheDocument();
  });

  it('com a empresa escolhida e permissões a carregar não volta a mostrar a lista', () => {
    m.orgId = 'org-decada';
    m.defaultRoute = null;
    montar();
    expect(screen.queryByText('Década Ousada')).not.toBeInTheDocument();
  });
});
