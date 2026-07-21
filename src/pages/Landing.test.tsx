import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useDefaultRoute', () => ({
  useDefaultRoute: vi.fn(),
}));

import Landing from './Landing';
import { useAuth } from '@/contexts/AuthContext';
import { useDefaultRoute } from '@/hooks/useDefaultRoute';

beforeAll(() => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

describe('Landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra a landing pública com todos os actos quando não há utilizador autenticado', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(useDefaultRoute).mockReturnValue({ defaultRoute: null, loading: false });

    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    expect(screen.getByText('A frota nunca pára. O sistema também não devia.')).toBeTruthy();
    expect(screen.getByText('Cada viatura vive em três sítios diferentes.')).toBeTruthy();
    expect(screen.getByText('Um fluxo só. Tudo ligado.')).toBeTruthy();
    expect(screen.getByText('Um contrato. Quatro passos automáticos.')).toBeTruthy();
    expect(screen.getByText('O calendário preenche-se sozinho.')).toBeTruthy();
    expect(screen.getByText('Cada semana fecha-se a si própria.')).toBeTruthy();
    expect(screen.getByText('Cada organização no seu fluxo.')).toBeTruthy();
    expect(screen.getByText('Liga só o que precisas.')).toBeTruthy();
    expect(screen.getByText('O seu fluxo começa aqui.')).toBeTruthy();

    expect(screen.getByRole('link', { name: 'Começar agora' })).toHaveAttribute(
      'href',
      '/registar-org'
    );
    expect(screen.getByRole('link', { name: 'Criar a minha organização' })).toHaveAttribute(
      'href',
      '/registar-org'
    );

    const entrarLinks = screen.getAllByRole('link', { name: 'Já é cliente? Entrar' });
    expect(entrarLinks.length).toBeGreaterThan(0);
    expect(entrarLinks[0]).toHaveAttribute('href', '/entrar');
  });

  it('não mostra a landing quando há utilizador autenticado', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as never,
      session: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(useDefaultRoute).mockReturnValue({ defaultRoute: '/dashboard', loading: false });

    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    expect(screen.queryByText('A frota nunca pára. O sistema também não devia.')).toBeNull();
  });
});
