import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMarketingListaContagem } from './useMarketingListaContagem';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useMarketingListaContagem', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devolve a contagem da RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: 7, error: null });

    const { result } = renderHook(() => useMarketingListaContagem('lista-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(7);
    expect(supabase.rpc).toHaveBeenCalledWith('marketing_lista_contagem', {
      p_lista_id: 'lista-1',
    });
  });

  it('não executa sem listaId', () => {
    const { result } = renderHook(() => useMarketingListaContagem(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
