import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useDefaultRoute', () => ({
  useDefaultRoute: vi.fn(),
}));

import { useRedirectIfAuthenticated } from './useRedirectIfAuthenticated';
import { useAuth } from '@/contexts/AuthContext';
import { useDefaultRoute } from '@/hooks/useDefaultRoute';

describe('useRedirectIfAuthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não navega enquanto está a carregar', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      loading: true,
      signOut: vi.fn(),
    });
    vi.mocked(useDefaultRoute).mockReturnValue({ defaultRoute: null, loading: true });

    const { result } = renderHook(() => useRedirectIfAuthenticated());

    expect(result.current.loading).toBe(true);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('não navega quando não há utilizador autenticado', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(useDefaultRoute).mockReturnValue({ defaultRoute: null, loading: false });

    const { result } = renderHook(() => useRedirectIfAuthenticated());

    expect(result.current.isAuthenticated).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('navega para defaultRoute quando autenticado e pronto', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as never,
      session: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(useDefaultRoute).mockReturnValue({ defaultRoute: '/dashboard', loading: false });

    const { result } = renderHook(() => useRedirectIfAuthenticated());

    expect(result.current.isAuthenticated).toBe(true);
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });
});
