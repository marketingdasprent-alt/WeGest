import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useDanoCategorias } from './useDanoCategorias';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function mockFromResolve(data: unknown[], error: unknown = null) {
  const mockOrder = vi.fn().mockResolvedValue({ data, error });
  const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
  (supabase as unknown as { from: unknown }).from = mockFrom;
  return mockFrom;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDanoCategorias', () => {
  it('devolve as categorias ativas, ordenadas', async () => {
    const fake = [
      { id: 'c1', nome: 'Sinistro', cor: '#EC4899' },
      { id: 'c2', nome: 'Outro', cor: '#6B7280' },
    ];
    const mockFrom = mockFromResolve(fake);

    const { result } = renderHook(() => useDanoCategorias(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(fake);
    expect(mockFrom).toHaveBeenCalledWith('assistencia_categorias');
  });

  it('propaga erro da query', async () => {
    mockFromResolve([], new Error('Erro de BD'));

    const { result } = renderHook(() => useDanoCategorias(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('Erro de BD');
  });
});
