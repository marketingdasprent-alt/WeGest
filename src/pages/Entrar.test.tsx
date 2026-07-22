import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useDefaultRoute', () => ({
  useDefaultRoute: vi.fn(),
}));

import Entrar from './Entrar';
import { useAuth } from '@/contexts/AuthContext';
import { useDefaultRoute } from '@/hooks/useDefaultRoute';

describe('Entrar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra as 3 opções de acesso quando não autenticado', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(useDefaultRoute).mockReturnValue({ defaultRoute: null, loading: false });

    render(
      <MemoryRouter>
        <Entrar />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /Área do Motorista/ })).toHaveAttribute(
      'href',
      '/motorista/login'
    );
    expect(screen.getByRole('link', { name: /Área de Colaboradores/ })).toHaveAttribute(
      'href',
      '/equipa'
    );
    expect(screen.getByRole('link', { name: /Quero usar o sistema/ })).toHaveAttribute(
      'href',
      '/registar-org'
    );
  });

  it('não mostra nada quando autenticado (redirect em curso)', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as never,
      session: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(useDefaultRoute).mockReturnValue({ defaultRoute: '/dashboard', loading: false });

    const { container } = render(
      <MemoryRouter>
        <Entrar />
      </MemoryRouter>
    );

    expect(container.textContent).toBe('');
  });
});
